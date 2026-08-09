const prisma = require("../../config/db");
const { AppError } = require("../../utils/asyncHandler");
const { findRankedEligibleDonors } = require("./matching");
const { notifyUser } = require("../notifications/notifications.service");
const { roughEtaMinutes } = require("../../utils/geo");
const { emitToAdmins } = require("../../sockets/emit");

const DEFAULT_RADIUS_KM = 10;
const MAX_RADIUS_KM = 50;
const ALERT_BATCH_SIZE = 20; // how many nearest donors get alerted per wave

const URGENCY_LABEL = { CRITICAL: "CRITICAL", HIGH: "Urgent", NORMAL: "Request" };

// Every request is a broadcast now — either by radius (nearest donors within
// `searchRadiusKm` of `lat`/`lng`) or by city (`city` set, ignores radius).
// Targeting individual donors by ID was removed as a request-creation option.
async function createRequest({ createdByUserId, createdByPublicId, bloodGroup, unitsNeeded, urgency, lat, lng, notes, expiresInHours, city, searchRadiusKm }) {
  const effectiveCity = city ? city.trim() : null;

  const request = await prisma.bloodRequest.create({
    data: {
      createdByUserId: createdByUserId || null,
      createdByPublicId: createdByPublicId || null,
      bloodGroup,
      unitsNeeded,
      urgency,
      lat,
      lng,
      notes,
      searchRadiusKm: searchRadiusKm || DEFAULT_RADIUS_KM,
      city: effectiveCity,
      expiresAt: expiresInHours ? new Date(Date.now() + expiresInHours * 3600 * 1000) : null,
    },
  });

  await dispatchAlerts(request);
  emitToAdmins("admin:request_created", { id: request.id, bloodGroup: request.bloodGroup, status: request.status });
  return request;
}

// Finds and alerts the next wave of eligible donors, nearest first. Called
// on creation, and again (excluding already-alerted donors) whenever units
// are still needed after a cancellation or a timeout-driven radius expansion.
async function dispatchAlerts(request) {
  const unitsRemaining = request.unitsNeeded - request.unitsClaimed;
  if (unitsRemaining <= 0) return [];

  // City-scoped broadcasts (no lat/lng radius restriction) can legitimately
  // match far more donors than a normal radius wave, so give them a much
  // higher cap than the usual "alert the nearest 20" batch.
  const donors = await findRankedEligibleDonors({
    requestId: request.id,
    lat: request.lat,
    lng: request.lng,
    bloodGroup: request.bloodGroup,
    radiusKm: request.searchRadiusKm,
    city: request.city,
    limit: request.city ? 500 : ALERT_BATCH_SIZE,
  });

  if (donors.length === 0) return [];

  await prisma.requestResponse.createMany({
    data: donors.map((d) => ({ requestId: request.id, donorId: d.donorId, distanceKm: d.distanceKm })),
    skipDuplicates: true,
  });

  const urgencyLabel = URGENCY_LABEL[request.urgency] || "Request";
  await Promise.all(
    donors.map((d) => {
      const distanceNote = d.distanceKm != null ? `~${d.distanceKm.toFixed(1)} km away, ETA ${roughEtaMinutes(d.distanceKm)} min.` : `in ${request.city}.`;
      return notifyUser({
        userId: d.donorId,
        requestId: request.id,
        type: "request:alert",
        title: `${urgencyLabel}: ${request.bloodGroup} blood needed`,
        body: `${request.unitsNeeded - request.unitsClaimed} unit(s) needed, ${distanceNote}`,
        deliverTo: "donor",
      });
    })
  );

  return donors;
}

// Who is allowed to read a request in full.
//
// This used to be any authenticated user, which meant any donor or any
// verified phone number could enumerate request ids and read patient context
// notes plus the names and distances of everyone who responded. Reads are now
// restricted to the people actually involved:
//   - ADMIN                      : anything
//   - the hospital that created it
//   - the public session that created it (matched on verified phone, so it
//     survives re-verifying and getting a new session id)
//   - a donor who was alerted for it — but see the redaction below
async function assertCanViewRequest(request, actorUser) {
  if (!actorUser) throw new AppError("Not authenticated", 401);
  if (actorUser.role === "ADMIN") return "full";
  if (actorUser.role === "HOSPITAL" && request.createdByUserId === actorUser.id) return "full";
  if (
    actorUser.scope === "public" &&
    request.createdByPublic &&
    request.createdByPublic.phone === actorUser.phone
  ) {
    return "full";
  }

  if (actorUser.role === "DONOR") {
    const alerted = await prisma.requestResponse.findUnique({
      where: { requestId_donorId: { requestId: request.id, donorId: actorUser.id } },
      select: { id: true },
    });
    if (alerted) return "donor";
  }

  throw new AppError("You do not have access to this request", 403);
}

async function getById(requestId, actorUser) {
  const request = await prisma.bloodRequest.findUnique({
    where: { id: requestId },
    include: {
      createdByPublic: { select: { phone: true } },
      responses: { include: { donor: { select: { fullName: true, bloodGroup: true } } } },
    },
  });
  if (!request) throw new AppError("Request not found", 404);

  const access = await assertCanViewRequest(request, actorUser);

  // Never leak the requester's phone number to anyone but themselves — it's
  // only loaded here to perform the ownership check above.
  const { createdByPublic, ...safe } = request;

  // A donor legitimately needs to see the request they were alerted for, but
  // has no business seeing who else was contacted. Show them only their own
  // response row.
  if (access === "donor") {
    return {
      ...safe,
      responses: request.responses.filter((r) => r.donorId === actorUser.id),
    };
  }

  return safe;
}

// A verified OTP session is short-lived (1h token) and thrown away on the
// next login, so a returning independent receiver has no way to look up
// their own broadcast by session id — it looks like it "disappeared" even
// though it's still sitting in the database. This looks it up by phone
// number instead, across every OTP session that phone has ever verified,
// so history survives logging in again.
async function listForPublicPhone(phone) {
  const sessions = await prisma.publicOtpSession.findMany({ where: { phone }, select: { id: true } });
  if (sessions.length === 0) return [];
  return prisma.bloodRequest.findMany({
    where: { createdByPublicId: { in: sessions.map((s) => s.id) } },
    orderBy: { createdAt: "desc" },
    include: { responses: { include: { donor: { select: { fullName: true, bloodGroup: true } } } } },
  });
}

// Widens the search radius for requests that still have unfilled units and
// haven't had a fresh alert wave recently — intended to run from a cron job.
async function expandStaleBroadcasts() {
  const stale = await prisma.bloodRequest.findMany({
    where: {
      status: { in: ["OPEN", "PARTIAL"] },
      city: null, // city-scoped broadcasts already alert everyone in one wave — no radius to widen
      searchRadiusKm: { lt: MAX_RADIUS_KM },
    },
  });

  for (const request of stale) {
    const widened = { ...request, searchRadiusKm: Math.min(request.searchRadiusKm + 10, MAX_RADIUS_KM) };
    await prisma.bloodRequest.update({ where: { id: request.id }, data: { searchRadiusKm: widened.searchRadiusKm } });
    await dispatchAlerts(widened);
  }

  return stale.length;
}

async function expireOldRequests() {
  const result = await prisma.bloodRequest.updateMany({
    where: { status: { in: ["OPEN", "PARTIAL"] }, expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

module.exports = {
  createRequest,
  dispatchAlerts,
  getById,
  assertCanViewRequest,
  listForPublicPhone,
  expandStaleBroadcasts,
  expireOldRequests,
  DEFAULT_RADIUS_KM,
};

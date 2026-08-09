const prisma = require("../../config/db");
const { AppError } = require("../../utils/asyncHandler");
const { notifyUser } = require("../notifications/notifications.service");
const { emitToHospital, emitToRequestRoom, emitToAdmins } = require("../../sockets/emit");
const { roughEtaMinutes } = require("../../utils/geo");
const requestsService = require("../requests/requests.service");

// Atomically claims one unit on a request. Returns the updated BloodRequest
// row, or null if there was no unit left to claim (the request filled up
// between the donor seeing the alert and tapping Accept). Using a single
// conditional UPDATE means concurrent accepts on the same request — or on a
// hospital's several simultaneous requests — can never over-claim, with no
// explicit locking required: Postgres serializes conflicting UPDATEs on the
// same row automatically.
async function claimUnit(requestId) {
  const rows = await prisma.$queryRawUnsafe(
    `
    UPDATE "BloodRequest"
    SET "unitsClaimed" = "unitsClaimed" + 1,
        status = CASE WHEN "unitsClaimed" + 1 >= "unitsNeeded" THEN 'FULFILLED'::"RequestStatus" ELSE 'PARTIAL'::"RequestStatus" END
    WHERE id = $1 AND "unitsClaimed" < "unitsNeeded" AND status IN ('OPEN', 'PARTIAL')
    RETURNING *
    `,
    requestId
  );
  return rows[0] || null;
}

// Releases a previously-claimed unit (donor cancelled or was marked a
// no-show before donating) and reopens the request for the next donor.
async function releaseUnit(requestId) {
  const rows = await prisma.$queryRawUnsafe(
    `
    UPDATE "BloodRequest"
    SET "unitsClaimed" = GREATEST("unitsClaimed" - 1, 0),
        status = CASE WHEN "unitsClaimed" - 1 <= 0 THEN 'OPEN'::"RequestStatus" ELSE 'PARTIAL'::"RequestStatus" END
    WHERE id = $1 AND status IN ('PARTIAL', 'FULFILLED')
    RETURNING *
    `,
    requestId
  );
  return rows[0] || null;
}

async function accept(requestId, donorId) {
  const response = await prisma.requestResponse.findUnique({
    where: { requestId_donorId: { requestId, donorId } },
  });
  if (!response) throw new AppError("You were not alerted for this request", 404);
  if (response.status !== "ALERTED") throw new AppError(`This response is already ${response.status.toLowerCase()}`, 409);

  const updatedRequest = await claimUnit(requestId);
  if (!updatedRequest) throw new AppError("This request has already been fulfilled or closed", 409);

  const etaMinutes = response.distanceKm != null ? roughEtaMinutes(response.distanceKm) : null;
  const updatedResponse = await prisma.requestResponse.update({
    where: { id: response.id },
    data: { status: "ACCEPTED", respondedAt: new Date(), etaMinutes },
  });

  if (updatedRequest.createdByUserId) {
    await notifyUser({
      userId: updatedRequest.createdByUserId,
      requestId,
      type: "response:accepted",
      title: "A donor accepted your request",
      body: `Distance ~${response.distanceKm?.toFixed(1) ?? "?"} km, ETA ${etaMinutes ?? "?"} min. ${updatedRequest.unitsNeeded - updatedRequest.unitsClaimed} unit(s) still needed.`,
      deliverTo: "hospital",
    });
  }
  emitToRequestRoom(requestId, "request:updated", updatedRequest);
  emitToAdmins("admin:request_updated", { id: requestId, status: updatedRequest.status });

  return { response: updatedResponse, request: updatedRequest };
}

async function decline(requestId, donorId) {
  const response = await prisma.requestResponse.findUnique({
    where: { requestId_donorId: { requestId, donorId } },
  });
  if (!response) throw new AppError("You were not alerted for this request", 404);
  if (response.status !== "ALERTED") throw new AppError(`This response is already ${response.status.toLowerCase()}`, 409);

  return prisma.requestResponse.update({
    where: { id: response.id },
    data: { status: "DECLINED", respondedAt: new Date() },
  });
}

// Donor backs out after already accepting. Releases the unit and instantly
// alerts the next nearest untried eligible donor(s) so the hospital doesn't
// lose time.
async function cancel(requestId, donorId) {
  const response = await prisma.requestResponse.findUnique({
    where: { requestId_donorId: { requestId, donorId } },
  });
  if (!response) throw new AppError("Response not found", 404);
  if (response.status !== "ACCEPTED") throw new AppError("Only an accepted response can be cancelled", 409);

  const updatedRequest = await releaseUnit(requestId);
  if (!updatedRequest) throw new AppError("Unable to cancel — request is no longer active", 409);

  await prisma.requestResponse.update({
    where: { id: response.id },
    data: { status: "CANCELLED", respondedAt: new Date() },
  });

  if (updatedRequest.createdByUserId) {
    await notifyUser({
      userId: updatedRequest.createdByUserId,
      requestId,
      type: "response:cancelled",
      title: "A donor cancelled — reassigning",
      body: "We're instantly alerting the next nearest eligible donor.",
      deliverTo: "hospital",
    });
  }
  emitToRequestRoom(requestId, "request:updated", updatedRequest);
  emitToAdmins("admin:request_updated", { id: requestId, status: updatedRequest.status });

  if (["OPEN", "PARTIAL"].includes(updatedRequest.status)) {
    await requestsService.dispatchAlerts(updatedRequest);
  }

  return updatedRequest;
}

// Confirms `actorUser` (from req.user) is allowed to manage this specific
// request: an admin can manage any request, a hospital only its own, and a
// public/OTP session only requests tied to its own verified phone number
// (matched across every session for that phone, same as GET /requests/public/mine
// — otherwise re-verifying OTP would lock someone out of their own request).
async function assertCanManageRequest(requestId, actorUser) {
  const request = await prisma.bloodRequest.findUnique({
    where: { id: requestId },
    include: { createdByPublic: { select: { phone: true } } },
  });
  if (!request) throw new AppError("Request not found", 404);

  if (actorUser.role === "ADMIN") return request;
  if (actorUser.role === "HOSPITAL") {
    if (request.createdByUserId !== actorUser.id) throw new AppError("You can only manage your own requests", 403);
    return request;
  }
  if (actorUser.scope === "public") {
    if (!request.createdByPublic || request.createdByPublic.phone !== actorUser.phone) {
      throw new AppError("You can only manage your own requests", 403);
    }
    return request;
  }
  throw new AppError("You do not have permission to perform this action", 403);
}

// Confirms the donation actually happened — the hospital, an admin, or
// (now) the independent/public requester who broadcast it, once they've
// gotten a donor's in-person confirmation. Ownership is enforced above.
async function complete(requestId, donorId, actorUser) {
  await assertCanManageRequest(requestId, actorUser);

  const response = await prisma.requestResponse.findUnique({
    where: { requestId_donorId: { requestId, donorId } },
    include: { request: true },
  });
  if (!response) throw new AppError("Response not found", 404);
  if (response.status !== "ACCEPTED") throw new AppError("Only an accepted response can be completed", 409);

  await prisma.$transaction([
    prisma.requestResponse.update({ where: { id: response.id }, data: { status: "COMPLETED", respondedAt: new Date() } }),
    prisma.donationTransaction.create({
      data: {
        requestId,
        donorId,
        hospitalId: response.request.createdByUserId || null,
        // Only a hospital/admin login is a real User row that can be
        // attributed here — a public OTP session has none, so this stays
        // null for independent-receiver confirmations.
        verifiedById: actorUser.role ? actorUser.id : null,
      },
    }),
    prisma.donorProfile.update({
      where: { userId: donorId },
      data: { totalDonations: { increment: 1 }, lastDonatedAt: new Date() },
    }),
  ]);

  emitToAdmins("admin:donation_completed", { requestId, donorId });

  return { ok: true };
}

// Marks that an accepted donor never showed up (hospital, admin, or the
// public requester — same ownership rule as complete()). Releases the
// unit so the request can be refilled and dings the donor's reliability.
async function noShow(requestId, donorId, actorUser) {
  await assertCanManageRequest(requestId, actorUser);

  const response = await prisma.requestResponse.findUnique({
    where: { requestId_donorId: { requestId, donorId } },
  });
  if (!response) throw new AppError("Response not found", 404);
  if (response.status !== "ACCEPTED") throw new AppError("Only an accepted response can be marked no-show", 409);

  const updatedRequest = await releaseUnit(requestId);

  await prisma.$transaction([
    prisma.requestResponse.update({ where: { id: response.id }, data: { status: "NO_SHOW", respondedAt: new Date() } }),
    prisma.donorProfile.update({ where: { userId: donorId }, data: { noShowCount: { increment: 1 } } }),
  ]);

  emitToAdmins("admin:request_updated", { id: requestId, status: updatedRequest?.status });

  if (updatedRequest && ["OPEN", "PARTIAL"].includes(updatedRequest.status)) {
    await requestsService.dispatchAlerts(updatedRequest);
  }

  return { ok: true };
}

// Donor pushes a coarse (~1/min) location update while en route on an
// accepted request; broadcast to whoever created the request.
async function recordLocationPing(requestId, donorId, lat, lng) {
  const response = await prisma.requestResponse.findUnique({ where: { requestId_donorId: { requestId, donorId } } });
  if (!response || response.status !== "ACCEPTED") {
    throw new AppError("Location updates are only accepted for an active, accepted response", 409);
  }

  const ping = await prisma.donorLocationPing.create({ data: { requestId, donorId, lat, lng } });
  emitToRequestRoom(requestId, "donor:location_update", { donorId, lat, lng, recordedAt: ping.recordedAt });
  return ping;
}

module.exports = { accept, decline, cancel, complete, noShow, recordLocationPing };

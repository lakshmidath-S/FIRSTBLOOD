const prisma = require("../../config/db");
const { AppError } = require("../../utils/asyncHandler");

const NO_SHOW_THRESHOLD = 3;
const INACTIVE_MONTHS = 6;

// Donors worth a human look: repeated no-shows, or signed up long ago with
// zero completed donations and no recent response activity at all.
//
// "Signed up" and "last responded" are read from the source of truth
// (User.createdAt and the donor's RequestResponse rows) rather than from
// summary columns on DonorProfile. The old columns duplicated this data, and
// lastResponseAt in particular was never actually written — so this query used
// to treat every donor as permanently inactive and flag people who had
// responded yesterday.
async function listFlaggedDonors() {
  const inactiveSince = new Date(Date.now() - INACTIVE_MONTHS * 30 * 24 * 3600 * 1000);

  const donors = await prisma.donorProfile.findMany({
    where: {
      OR: [
        { noShowCount: { gte: NO_SHOW_THRESHOLD } },
        {
          totalDonations: 0,
          user: { createdAt: { lte: inactiveSince } },
          // No response at all in the inactivity window.
          responses: { none: { respondedAt: { gt: inactiveSince } } },
        },
      ],
    },
    include: { user: { select: { email: true, isBanned: true, isActive: true, createdAt: true } } },
    orderBy: { noShowCount: "desc" },
  });

  return donors.map((d) => ({
    ...d,
    flagReason:
      d.noShowCount >= NO_SHOW_THRESHOLD
        ? `${d.noShowCount} no-shows`
        : `joined ${INACTIVE_MONTHS}+ months ago, 0 donations, inactive`,
  }));
}

async function banDonor(donorId, actorId) {
  const user = await prisma.user.findUnique({ where: { id: donorId } });
  if (!user || user.role !== "DONOR") throw new AppError("Donor not found", 404);

  await prisma.$transaction([
    prisma.user.update({ where: { id: donorId }, data: { isBanned: true, isActive: false } }),
    prisma.auditLog.create({
      data: { actorId, action: "BAN_DONOR", entityType: "User", entityId: donorId, meta: { reason: "admin flagged as ghost/fake donor" } },
    }),
  ]);
  return { ok: true };
}

async function unbanDonor(donorId, actorId) {
  await prisma.$transaction([
    prisma.user.update({ where: { id: donorId }, data: { isBanned: false, isActive: true } }),
    prisma.auditLog.create({ data: { actorId, action: "UNBAN_DONOR", entityType: "User", entityId: donorId } }),
  ]);
  return { ok: true };
}

async function listAllRequests() {
  return prisma.bloodRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { responses: { select: { status: true, donorId: true } } },
  });
}

async function verifyHospital(hospitalUserId, actorId) {
  const updated = await prisma.hospitalProfile.update({ where: { userId: hospitalUserId }, data: { verified: true } });
  await prisma.auditLog.create({ data: { actorId, action: "VERIFY_HOSPITAL", entityType: "HospitalProfile", entityId: hospitalUserId } });
  return updated;
}

module.exports = { listFlaggedDonors, banDonor, unbanDonor, listAllRequests, verifyHospital };

const prisma = require("../../config/db");
const { AppError } = require("../../utils/asyncHandler");
const { requireMobileApp } = require("../requests/matching");

const ELIGIBILITY_DAYS = 90;

function isEligibleToDonate(lastDonatedAt) {
  if (!lastDonatedAt) return true;
  const daysSince = (Date.now() - new Date(lastDonatedAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= ELIGIBILITY_DAYS;
}

// Returns the profile plus every reason the donor might not currently be
// matchable, so the dashboards can explain the situation instead of leaving
// someone wondering why they never get alerts. `isMatchable` is the single
// flag that mirrors exactly what the matching query will decide.
async function getMyProfile(userId) {
  const [profile, deviceCount] = await Promise.all([
    prisma.donorProfile.findUnique({ where: { userId } }),
    prisma.device.count({ where: { userId } }),
  ]);
  if (!profile) throw new AppError("Donor profile not found", 404);

  const eligible = isEligibleToDonate(profile.lastDonatedAt);
  const hasMobileApp = deviceCount > 0;

  return {
    ...profile,
    isEligibleToDonate: eligible,
    hasMobileApp,
    mobileAppRequired: requireMobileApp,
    isMatchable: eligible && profile.isAvailable && (!requireMobileApp || hasMobileApp),
  };
}

async function updateAvailability(userId, isAvailable) {
  return prisma.donorProfile.update({ where: { userId }, data: { isAvailable } });
}

async function updateLocation(userId, lat, lng, city) {
  return prisma.donorProfile.update({
    where: { userId },
    data: {
      lat,
      lng,
      locationUpdatedAt: new Date(),
      ...(city !== undefined ? { city: city || null } : {}),
    },
  });
}

// Lets a donor set/correct their city independently of a GPS location
// update — used for the "broadcast to everyone in <city>" matching mode.
async function updateCity(userId, city) {
  return prisma.donorProfile.update({ where: { userId }, data: { city: city || null } });
}

async function getMyHistory(userId) {
  return prisma.donationTransaction.findMany({
    where: { donorId: userId },
    orderBy: { donatedAt: "desc" },
    include: { hospital: { select: { hospitalName: true } }, request: { select: { bloodGroup: true, urgency: true } } },
  });
}

async function getMyResponses(userId) {
  return prisma.requestResponse.findMany({
    where: { donorId: userId },
    orderBy: { alertedAt: "desc" },
    include: {
      request: { select: { id: true, bloodGroup: true, unitsNeeded: true, unitsClaimed: true, status: true, urgency: true, notes: true, lat: true, lng: true } },
    },
  });
}

module.exports = {
  ELIGIBILITY_DAYS,
  isEligibleToDonate,
  getMyProfile,
  updateAvailability,
  updateLocation,
  updateCity,
  getMyHistory,
  getMyResponses,
};

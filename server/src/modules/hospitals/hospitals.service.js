const prisma = require("../../config/db");
const { AppError } = require("../../utils/asyncHandler");

async function getMyProfile(userId) {
  const profile = await prisma.hospitalProfile.findUnique({ where: { userId } });
  if (!profile) throw new AppError("Hospital profile not found", 404);
  return profile;
}

async function updateProfile(userId, data) {
  return prisma.hospitalProfile.update({
    where: { userId },
    data: {
      hospitalName: data.hospitalName,
      address: data.address,
      city: data.city,
      lat: data.lat,
      lng: data.lng,
    },
  });
}

async function getMyRequests(userId) {
  return prisma.bloodRequest.findMany({
    where: { createdByUserId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      responses: { include: { donor: { select: { fullName: true, bloodGroup: true } } } },
    },
  });
}

module.exports = { getMyProfile, updateProfile, getMyRequests };

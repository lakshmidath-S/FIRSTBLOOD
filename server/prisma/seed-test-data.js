// Seeds realistic demo/test data: 50 donors + 5 hospitals scattered across
// Kochi and nearby towns in Ernakulam district, Kerala. Safe to re-run —
// every row is upserted by email, so running it twice just updates in place
// instead of duplicating. Meant for local development / demoing the app
// with a database that has enough donors/hospitals to actually exercise
// the matching, broadcast, and concurrency logic — NOT for production.
//
// Run with: npm run seed:test-data  (after `npm run seed` for the admin account)
//
// All accounts share one password per role (see credentials PDF) —
// these are throwaway test logins, not real people. Change or delete this
// data before going anywhere near production.
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { donors, hospitals } = require("./test-data.json");

const prisma = new PrismaClient();

async function seedDonor(d) {
  const passwordHash = await bcrypt.hash(d.password, 10);
  const user = await prisma.user.upsert({
    where: { email: d.email },
    update: { passwordHash, phone: d.phone },
    create: {
      role: "DONOR",
      email: d.email,
      phone: d.phone,
      passwordHash,
      isActive: true,
    },
  });

  // Donors are only matchable if the mobile app is installed (see
  // src/modules/requests/matching.js), so give each seeded donor a fake
  // install — otherwise every seeded donor would be invisible to matching
  // and the demo data would look broken.
  await prisma.device.upsert({
    where: { installId: `seed-install-${d.email}` },
    update: { userId: user.id, lastSeenAt: new Date() },
    create: { userId: user.id, installId: `seed-install-${d.email}`, platform: "android" },
  });

  await prisma.donorProfile.upsert({
    where: { userId: user.id },
    update: {
      fullName: d.fullName,
      bloodGroup: d.bloodGroup,
      gender: d.gender,
      dob: new Date(d.dob),
      city: d.city,
      lat: d.lat,
      lng: d.lng,
      isAvailable: d.isAvailable,
      lastDonatedAt: d.lastDonatedAt ? new Date(d.lastDonatedAt) : null,
      locationUpdatedAt: new Date(),
    },
    create: {
      userId: user.id,
      fullName: d.fullName,
      bloodGroup: d.bloodGroup,
      gender: d.gender,
      dob: new Date(d.dob),
      city: d.city,
      lat: d.lat,
      lng: d.lng,
      isAvailable: d.isAvailable,
      lastDonatedAt: d.lastDonatedAt ? new Date(d.lastDonatedAt) : null,
      locationUpdatedAt: new Date(),
    },
  });
}

async function seedHospital(h) {
  const passwordHash = await bcrypt.hash(h.password, 10);
  const user = await prisma.user.upsert({
    where: { email: h.email },
    update: { passwordHash, phone: h.phone },
    create: {
      role: "HOSPITAL",
      email: h.email,
      phone: h.phone,
      passwordHash,
      isActive: true,
    },
  });

  await prisma.hospitalProfile.upsert({
    where: { userId: user.id },
    update: {
      hospitalName: h.hospitalName,
      registrationNo: h.registrationNo,
      address: h.address,
      city: h.city,
      lat: h.lat,
      lng: h.lng,
      verified: true,
    },
    create: {
      userId: user.id,
      hospitalName: h.hospitalName,
      registrationNo: h.registrationNo,
      address: h.address,
      city: h.city,
      lat: h.lat,
      lng: h.lng,
      verified: true,
    },
  });
}

async function main() {
  for (const d of donors) await seedDonor(d);
  for (const h of hospitals) await seedHospital(h);
  console.log(`Seeded ${donors.length} donors and ${hospitals.length} hospitals near Kochi, Kerala.`);
  console.log("Shared passwords — Donor@123 (all donors), Hospital@123 (all hospitals). Full list in the credentials PDF.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

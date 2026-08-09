// Seeds a default admin account so there's a way in on a fresh database.
// Run with: npm run seed  (after `npx prisma migrate dev`)
//
// CHANGE THIS PASSWORD after first login — it's a well-known placeholder,
// not a secret. Anyone with your repo/README can read it.
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DEFAULT_ADMIN = {
  email: "admin@fb.com",
  password: "fbadmin@123",
  name: "Default Admin",
};

async function main() {
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN.password, 10);

  const user = await prisma.user.upsert({
    where: { email: DEFAULT_ADMIN.email },
    update: {},
    create: {
      role: "ADMIN",
      email: DEFAULT_ADMIN.email,
      passwordHash,
      isActive: true,
    },
  });

  await prisma.adminProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, name: DEFAULT_ADMIN.name },
  });

  console.log(`Seeded admin: ${DEFAULT_ADMIN.email} / ${DEFAULT_ADMIN.password} (change this password after first login)`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

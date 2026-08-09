const { PrismaClient } = require("@prisma/client");

// Single shared Prisma client, reused across the app (connection pooling is
// handled internally by Prisma / the underlying pg pool).
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

module.exports = prisma;

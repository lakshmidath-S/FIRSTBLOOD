const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = require("../../config/db");
const { signAccessToken, signRefreshToken } = require("../../utils/jwt");
const { AppError } = require("../../utils/asyncHandler");

async function registerCredentialUser({ role, email, password, phone, profile }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError("An account with this email already exists", 409);

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { role, email, passwordHash, phone },
    });

    if (role === "DONOR") {
      await tx.donorProfile.create({
        data: {
          userId: created.id,
          fullName: profile.fullName,
          bloodGroup: profile.bloodGroup,
          dob: profile.dob ? new Date(profile.dob) : null,
          gender: profile.gender || null,
        },
      });
    } else if (role === "HOSPITAL") {
      // A hospital's location is fixed and reused for every request it
      // creates afterwards (see requests.routes.js) — required up front so
      // there's never a request-creation-time prompt for it.
      if (!profile.city || !profile.city.trim()) {
        throw new AppError("Hospital city is required", 400);
      }
      if (profile.lat == null || profile.lng == null) {
        throw new AppError("Hospital location is required — use \"Detect my location\" during registration", 400);
      }
      await tx.hospitalProfile.create({
        data: {
          userId: created.id,
          hospitalName: profile.hospitalName,
          registrationNo: profile.registrationNo || null,
          address: profile.address || null,
          city: profile.city.trim(),
          lat: profile.lat,
          lng: profile.lng,
        },
      });
    } else if (role === "ADMIN") {
      await tx.adminProfile.create({
        data: { userId: created.id, name: profile.name },
      });
    }

    return created;
  });

  return issueTokens(user);
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) throw new AppError("Invalid email or password", 401);
  if (user.isBanned) throw new AppError("This account has been suspended", 403);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError("Invalid email or password", 401);

  return issueTokens(user);
}

function issueTokens(user) {
  const payload = { id: user.id, role: user.role };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user: { id: user.id, role: user.role, email: user.email },
  };
}

// --- Public (non-registered) OTP flow — simulated, no real SMS provider ---

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_PHONE_PER_HOUR = 5;

// The OTP is only echoed back to the caller when there's no SMS gateway to
// send it through. In production that would hand anyone a login for any phone
// number they can type, so it's gated on an explicit opt-in.
const exposeOtpInResponse =
  process.env.NODE_ENV !== "production" || process.env.EXPOSE_OTP_IN_RESPONSE === "true";

async function requestOtp(phone) {
  // Per-phone throttle, on top of the per-IP limiter in auth.routes.js.
  // Without this, one IP rotating phone numbers (or many IPs targeting one
  // number) can spam sessions — and once a real SMS gateway is wired up,
  // that's someone else's phone being used as a doorbell, at your cost.
  const recent = await prisma.publicOtpSession.count({
    where: { phone, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recent >= OTP_MAX_PER_PHONE_PER_HOUR) {
    throw new AppError("Too many codes requested for this number. Try again in an hour.", 429);
  }

  const otp = String(crypto.randomInt(100000, 1000000)).padStart(6, "0");
  const otpHash = await bcrypt.hash(otp, 8);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const session = await prisma.publicOtpSession.create({
    data: { phone, otpHash, expiresAt },
  });

  if (!exposeOtpInResponse) {
    // Nothing actually delivers this yet — wiring up a real SMS provider is
    // the remaining piece before this flow is production-usable.
    console.warn(`[otp] No SMS provider configured; code for ${phone} was not delivered.`);
  }

  return {
    sessionId: session.id,
    expiresInMinutes: OTP_TTL_MINUTES,
    ...(exposeOtpInResponse ? { otp } : {}),
  };
}

async function verifyOtp(sessionId, otp) {
  const session = await prisma.publicOtpSession.findUnique({ where: { id: sessionId } });
  // Deliberately vague: distinguishing "no such session" from "wrong code"
  // would let someone probe which session ids exist.
  if (!session) throw new AppError("Invalid or expired code", 400);
  if (session.verified) throw new AppError("This code has already been used", 400);
  if (session.expiresAt < new Date()) throw new AppError("Invalid or expired code", 400);
  if (session.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError("Too many incorrect attempts. Request a new code.", 429);
  }

  const valid = await bcrypt.compare(otp, session.otpHash);
  if (!valid) {
    // Count the miss before returning, so a burst of parallel guesses still
    // walks the counter up rather than all reading attempts=0.
    await prisma.publicOtpSession.update({
      where: { id: session.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError("Invalid or expired code", 400);
  }

  await prisma.publicOtpSession.update({ where: { id: session.id }, data: { verified: true } });

  const accessToken = signAccessToken({ scope: "public", sessionId: session.id, phone: session.phone }, "1h");
  return { accessToken, sessionId: session.id };
}

module.exports = { registerCredentialUser, login, requestOtp, verifyOtp };

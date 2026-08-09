const express = require("express");
const { z } = require("zod");
const svc = require("./auth.service");
const { asyncHandler } = require("../../utils/asyncHandler");
const { authLimiter, otpRequestLimiter, otpVerifyLimiter } = require("../../middleware/rateLimit");

const router = express.Router();

// ADMIN is deliberately excluded here — admin accounts are hardcoded via
// `npm run seed` for now (see prisma/seed.js), not self-registerable.
//
// `profile` is intentionally loose: its shape depends on the role and is
// validated in auth.service.js, which is also where the hospital
// city/location requirement is enforced.
const registerSchema = z.object({
  role: z.enum(["DONOR", "HOSPITAL"]),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  phone: z.string().max(30).optional(),
  profile: z.record(z.any()),
});

router.post(
  "/register",
  authLimiter,
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const result = await svc.registerCredentialUser(data);
    res.status(201).json(result);
  })
);

const loginSchema = z.object({ email: z.string().email(), password: z.string().max(200) });

router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const result = await svc.login(data);
    res.json(result);
  })
);

router.post(
  "/otp/request",
  otpRequestLimiter,
  asyncHandler(async (req, res) => {
    const { phone } = z.object({ phone: z.string().min(7).max(20) }).parse(req.body);
    const result = await svc.requestOtp(phone);
    res.json(result);
  })
);

router.post(
  "/otp/verify",
  otpVerifyLimiter,
  asyncHandler(async (req, res) => {
    const { sessionId, otp } = z
      .object({ sessionId: z.string().uuid(), otp: z.string().length(6) })
      .parse(req.body);
    const result = await svc.verifyOtp(sessionId, otp);
    res.json(result);
  })
);

module.exports = router;

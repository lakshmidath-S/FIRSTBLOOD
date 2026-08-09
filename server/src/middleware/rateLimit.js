const rateLimit = require("express-rate-limit");

// Rate limits are per-IP and in-memory, which means they reset on restart and
// are per-instance. That's a real limitation if you ever scale past one dyno
// (see the Redis note in PROJECT_PLAN.md), but it still closes the practical
// hole: an unthrottled login endpoint is a free password-guessing oracle.

function makeLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Match the app's error shape so clients surface it like any other error.
    handler: (req, res) => res.status(429).json({ error: message }),
  });
}

// Login/registration: slow enough to make credential stuffing impractical,
// loose enough that a person fat-fingering their password isn't locked out.
const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: "Too many attempts. Please wait a few minutes and try again.",
});

// OTP requests are the expensive/abusable one — each is an SMS to someone
// else's phone once a real gateway is wired in. Per-phone throttling also
// happens in auth.service.js; this is the per-IP half.
const otpRequestLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: "Too many codes requested. Please try again later.",
});

const otpVerifyLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: "Too many verification attempts. Please request a new code.",
});

// Broad backstop for everything else, generous enough that the dashboards'
// 15–30s polling never trips it.
const generalLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 300,
  message: "Too many requests. Please slow down.",
});

module.exports = { authLimiter, otpRequestLimiter, otpVerifyLimiter, generalLimiter };

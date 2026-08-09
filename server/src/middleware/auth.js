const { verifyAccessToken } = require("../utils/jwt");
const { AppError } = require("../utils/asyncHandler");

// Verifies the JWT and attaches { id, role, scope? } to req.user.
// `scope: "public"` tokens (from OTP verification) are intentionally
// limited — see requireScope below.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new AppError("Missing or invalid Authorization header", 401));

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    next(new AppError("Invalid or expired token", 401));
  }
}

// Restrict a route to one or more roles: requireRole("ADMIN"), requireRole("ADMIN","HOSPITAL")
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError("Not authenticated", 401));
    if (!roles.includes(req.user.role)) {
      return next(new AppError("You do not have permission to perform this action", 403));
    }
    next();
  };
}

// Public (OTP) tokens carry scope: "public" and no `role` — used for the
// broadcast-only request creation endpoint.
function requirePublicScope(req, res, next) {
  if (!req.user || req.user.scope !== "public") {
    return next(new AppError("A verified OTP session is required", 401));
  }
  next();
}

module.exports = { requireAuth, requireRole, requirePublicScope };

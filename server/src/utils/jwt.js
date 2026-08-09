const jwt = require("jsonwebtoken");

const DEV_ACCESS_FALLBACK = "dev_access_secret_change_me";
const DEV_REFRESH_FALLBACK = "dev_refresh_secret_change_me";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || DEV_ACCESS_FALLBACK;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || DEV_REFRESH_FALLBACK;

// Falling back to a hardcoded secret is fine locally and catastrophic in
// production: the fallback is in the public repo, so anyone could mint a
// token for any user id and role — including ADMIN. Rather than failing
// silently, refuse to start.
const usingFallback = ACCESS_SECRET === DEV_ACCESS_FALLBACK || REFRESH_SECRET === DEV_REFRESH_FALLBACK;

if (usingFallback) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in production. " +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }
  console.warn(
    "[auth] Using development JWT secrets. Set JWT_ACCESS_SECRET / JWT_REFRESH_SECRET before deploying."
  );
}

if (ACCESS_SECRET === REFRESH_SECRET) {
  throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.");
}

function signAccessToken(payload, expiresIn = "2h") {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn });
}

function signRefreshToken(payload, expiresIn = "30d") {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn });
}

function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

// Note: there's no verifyRefreshToken because there's no refresh endpoint yet
// — clients only use the 2h access token. See the known-gaps list in README.

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken };

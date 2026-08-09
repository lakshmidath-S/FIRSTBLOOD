// Shared CORS origin resolution for both the Express app (index.js) and the
// Socket.io server (sockets/index.js) — they need to agree, or REST calls
// succeed while the socket handshake gets silently blocked (or vice versa).
//
// CLIENT_ORIGIN accepts one origin (the common case — a single deployed
// frontend) or a comma-separated list, which matters once you're running a
// local dev client against a deployed backend, or a Vercel preview-deploy
// URL alongside the production one. Leaving it unset falls back to "allow
// any origin", which is fine for local dev but should always be set once
// this is actually deployed (see README's Render/Vercel deploy notes).
function getAllowedOrigins() {
  const raw = process.env.CLIENT_ORIGIN;
  if (!raw || !raw.trim()) return null; // null => allow all
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

// Returns a value suitable for both `cors({ origin })` and
// `new Server(httpServer, { cors: { origin } })` — a function form so a
// comma-separated list is validated per-request instead of a single string.
function corsOrigin() {
  const allowed = getAllowedOrigins();
  if (!allowed) return "*";
  if (allowed.length === 1) return allowed[0];
  return (origin, callback) => {
    // `origin` is undefined for same-origin/non-browser requests (curl,
    // server-to-server, Postman) — always allow those.
    if (!origin || allowed.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  };
}

module.exports = { corsOrigin };

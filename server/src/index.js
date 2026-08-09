require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const { generalLimiter } = require("./middleware/rateLimit");
const { initSockets } = require("./sockets");
const { startCronJobs } = require("./jobs/cron");
const { corsOrigin } = require("./config/cors");

const authRoutes = require("./modules/auth/auth.routes");
const donorRoutes = require("./modules/donors/donors.routes");
const hospitalRoutes = require("./modules/hospitals/hospitals.routes");
const requestRoutes = require("./modules/requests/requests.routes");
const responseRoutes = require("./modules/responses/responses.routes");
const notificationRoutes = require("./modules/notifications/notifications.routes");
const adminRoutes = require("./modules/admin/admin.routes");

const app = express();

// Render (and most PaaS) terminate TLS at a proxy, so the client IP arrives in
// X-Forwarded-For. Without this the rate limiters would key every request to
// the proxy's address and throttle all users as if they were one.
app.set("trust proxy", 1);

// Sensible security headers. CSP is left off: this server only returns JSON,
// and the frontend is served by Vercel, which is where a CSP belongs.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));

app.use(cors({ origin: corsOrigin() }));
// Cap request bodies — nothing this API accepts is large, and the default
// 100kb is already generous for it.
app.use(express.json({ limit: "100kb" }));
app.use(generalLimiter);

app.get("/", (req, res) => {
  res.json({
    message: "FIRSTBLOOD API is running",
    status: "OK",
  });
});

app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/donors", donorRoutes);
app.use("/api/hospitals", hospitalRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/responses", responseRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);
initSockets(server);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`FIRSTBLOOD server listening on :${PORT}`);
  startCronJobs();
});

module.exports = { app, server };

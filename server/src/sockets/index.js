const { Server } = require("socket.io");
const prisma = require("../config/db");
const { verifyAccessToken } = require("../utils/jwt");
const { setIo } = require("./io");
const { corsOrigin } = require("../config/cors");
const responsesService = require("../modules/responses/responses.service");
const requestsService = require("../modules/requests/requests.service");

function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin(), methods: ["GET", "POST"] },
  });

  // Auth handshake: client connects with `auth: { token }` (the same JWT
  // used for REST calls). Invalid/missing token rejects the connection.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Missing auth token"));
      socket.user = verifyAccessToken(token);
      next();
    } catch (err) {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const { id, role } = socket.user;

    if (role === "DONOR") socket.join(`donor:${id}`);
    else if (role === "HOSPITAL") socket.join(`hospital:${id}`);
    else if (role === "ADMIN") socket.join("admins");

    // Donor's client streams a coarse (~1/min) location while en route on
    // an accepted request; we persist + rebroadcast via the same service
    // used by the REST endpoint so both paths stay consistent.
    socket.on("location:ping", async ({ requestId, lat, lng }, ack) => {
      try {
        if (role !== "DONOR") throw new Error("Only donors send location pings");
        const ping = await responsesService.recordLocationPing(requestId, id, Number(lat), Number(lng));
        ack?.({ ok: true, recordedAt: ping.recordedAt });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Joining a request room is an authorization decision, not a formality:
    // that room carries donors' live coordinates. Without this check any
    // authenticated socket could join any request id and watch strangers
    // move around, so membership is verified against the same rule the REST
    // endpoint uses before the join is allowed.
    socket.on("request:subscribe", async (requestId, ack) => {
      try {
        if (typeof requestId !== "string" || !requestId) throw new Error("Invalid request id");

        const request = await prisma.bloodRequest.findUnique({
          where: { id: requestId },
          select: {
            id: true,
            createdByUserId: true,
            createdByPublic: { select: { phone: true } },
          },
        });
        if (!request) throw new Error("Request not found");

        const access = await requestsService.assertCanViewRequest(request, socket.user);
        // Deliberately stricter than the REST read: an alerted donor may view
        // the request, but the room also carries *other* donors' live
        // coordinates, so only the requester (or an admin) gets in.
        if (access !== "full") throw new Error("You do not have access to this request");

        socket.join(`request:${requestId}`);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on("request:unsubscribe", (requestId) => {
      if (typeof requestId === "string" && requestId) socket.leave(`request:${requestId}`);
    });
  });

  setIo(io);
  return io;
}

module.exports = { initSockets };

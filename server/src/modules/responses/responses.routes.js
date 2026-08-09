const express = require("express");
const svc = require("./responses.service");
const { asyncHandler, AppError } = require("../../utils/asyncHandler");
const { requireAuth, requireRole } = require("../../middleware/auth");

const router = express.Router();

router.post("/:requestId/accept", requireAuth, requireRole("DONOR"), asyncHandler(async (req, res) => {
  res.json(await svc.accept(req.params.requestId, req.user.id));
}));

router.post("/:requestId/decline", requireAuth, requireRole("DONOR"), asyncHandler(async (req, res) => {
  res.json(await svc.decline(req.params.requestId, req.user.id));
}));

router.post("/:requestId/cancel", requireAuth, requireRole("DONOR"), asyncHandler(async (req, res) => {
  res.json(await svc.cancel(req.params.requestId, req.user.id));
}));

// Whoever actually needs the blood can confirm a donation happened — the
// hospital, an admin, or (new) the independent/public requester who
// broadcast the request in the first place. Ownership is enforced in
// responses.service.assertCanManageRequest, not here: a hospital can only
// confirm its own requests, and a public session can only confirm requests
// tied to its own verified phone number.
function requireRequestManager(req, res, next) {
  if (req.user.role === "HOSPITAL" || req.user.role === "ADMIN" || req.user.scope === "public") return next();
  next(new AppError("You do not have permission to perform this action", 403));
}

router.post("/:requestId/donors/:donorId/complete", requireAuth, requireRequestManager, asyncHandler(async (req, res) => {
  res.json(await svc.complete(req.params.requestId, req.params.donorId, req.user));
}));

router.post("/:requestId/donors/:donorId/no-show", requireAuth, requireRequestManager, asyncHandler(async (req, res) => {
  res.json(await svc.noShow(req.params.requestId, req.params.donorId, req.user));
}));

router.post("/:requestId/location", requireAuth, requireRole("DONOR"), asyncHandler(async (req, res) => {
  const { lat, lng } = req.body;
  res.json(await svc.recordLocationPing(req.params.requestId, req.user.id, Number(lat), Number(lng)));
}));

module.exports = router;

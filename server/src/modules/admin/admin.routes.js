const express = require("express");
const svc = require("./admin.service");
const analytics = require("../analytics/analytics.service");
const { asyncHandler } = require("../../utils/asyncHandler");
const { requireAuth, requireRole } = require("../../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("ADMIN"));

router.get("/donors/flagged", asyncHandler(async (req, res) => {
  res.json(await svc.listFlaggedDonors());
}));

router.post("/donors/:id/ban", asyncHandler(async (req, res) => {
  res.json(await svc.banDonor(req.params.id, req.user.id));
}));

router.post("/donors/:id/unban", asyncHandler(async (req, res) => {
  res.json(await svc.unbanDonor(req.params.id, req.user.id));
}));

router.get("/requests", asyncHandler(async (req, res) => {
  res.json(await svc.listAllRequests());
}));

router.post("/hospitals/:id/verify", asyncHandler(async (req, res) => {
  res.json(await svc.verifyHospital(req.params.id, req.user.id));
}));

router.get("/analytics", asyncHandler(async (req, res) => {
  res.json(await analytics.getSnapshot());
}));

router.post("/analytics/refresh", asyncHandler(async (req, res) => {
  res.json(await analytics.refreshNarrative(Number(req.body?.sinceDays) || 30));
}));

module.exports = router;

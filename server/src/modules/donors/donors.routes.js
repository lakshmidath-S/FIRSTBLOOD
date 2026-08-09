const express = require("express");
const { z } = require("zod");
const svc = require("./donors.service");
const { asyncHandler } = require("../../utils/asyncHandler");
const { requireAuth, requireRole } = require("../../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("DONOR"));

router.get("/me", asyncHandler(async (req, res) => {
  res.json(await svc.getMyProfile(req.user.id));
}));

router.patch("/me/availability", asyncHandler(async (req, res) => {
  const { isAvailable } = z.object({ isAvailable: z.boolean() }).parse(req.body);
  res.json(await svc.updateAvailability(req.user.id, isAvailable));
}));

router.patch("/me/location", asyncHandler(async (req, res) => {
  const { lat, lng, city } = z
    .object({ lat: z.number(), lng: z.number(), city: z.string().trim().min(1).max(100).optional() })
    .parse(req.body);
  res.json(await svc.updateLocation(req.user.id, lat, lng, city));
}));

router.patch("/me/city", asyncHandler(async (req, res) => {
  const { city } = z.object({ city: z.string().trim().min(1).max(100) }).parse(req.body);
  res.json(await svc.updateCity(req.user.id, city));
}));

router.get("/me/history", asyncHandler(async (req, res) => {
  res.json(await svc.getMyHistory(req.user.id));
}));

router.get("/me/responses", asyncHandler(async (req, res) => {
  res.json(await svc.getMyResponses(req.user.id));
}));

module.exports = router;

const express = require("express");
const { z } = require("zod");
const svc = require("./hospitals.service");
const { asyncHandler } = require("../../utils/asyncHandler");
const { requireAuth, requireRole } = require("../../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("HOSPITAL"));

router.get("/me", asyncHandler(async (req, res) => {
  res.json(await svc.getMyProfile(req.user.id));
}));

router.patch("/me", asyncHandler(async (req, res) => {
  const data = z
    .object({
      hospitalName: z.string().min(1).optional(),
      address: z.string().optional(),
      city: z.string().trim().min(1).optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    })
    .parse(req.body);
  res.json(await svc.updateProfile(req.user.id, data));
}));

router.get("/me/requests", asyncHandler(async (req, res) => {
  res.json(await svc.getMyRequests(req.user.id));
}));

module.exports = router;

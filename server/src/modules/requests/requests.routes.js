const express = require("express");
const { z } = require("zod");
const svc = require("./requests.service");
const prisma = require("../../config/db");
const { asyncHandler, AppError } = require("../../utils/asyncHandler");
const { requireAuth, requireRole, requirePublicScope } = require("../../middleware/auth");

const router = express.Router();

const requestCoreSchema = z.object({
  bloodGroup: z.enum(["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"]),
  unitsNeeded: z.number().int().min(1).max(20),
  urgency: z.enum(["CRITICAL", "HIGH", "NORMAL"]).default("NORMAL"),
  notes: z.string().max(500).optional(),
  expiresInHours: z.number().min(1).max(72).optional(),
});

// Hospitals never type a location or a city per request — both are fixed on
// their profile (set at registration, editable from the dashboard) and
// reused automatically here. All a hospital picks per request is whether to
// broadcast by radius or to everyone in its own city.
const hospitalRequestSchema = requestCoreSchema.extend({
  broadcastScope: z.enum(["RADIUS", "CITY"]).default("RADIUS"),
  searchRadiusKm: z.number().int().min(1).max(50).optional(),
});

router.post(
  "/",
  requireAuth,
  requireRole("HOSPITAL"),
  asyncHandler(async (req, res) => {
    const data = hospitalRequestSchema.parse(req.body);

    const hospitalProfile = await prisma.hospitalProfile.findUnique({ where: { userId: req.user.id } });
    if (!hospitalProfile || hospitalProfile.lat == null || hospitalProfile.lng == null) {
      throw new AppError("Set your hospital's location from the dashboard before creating a request", 400);
    }
    if (data.broadcastScope === "CITY" && !hospitalProfile.city) {
      throw new AppError("Set your hospital's city from the dashboard before broadcasting by city", 400);
    }

    const request = await svc.createRequest({
      createdByUserId: req.user.id,
      bloodGroup: data.bloodGroup,
      unitsNeeded: data.unitsNeeded,
      urgency: data.urgency,
      notes: data.notes,
      expiresInHours: data.expiresInHours,
      lat: hospitalProfile.lat,
      lng: hospitalProfile.lng,
      searchRadiusKm: data.broadcastScope === "RADIUS" ? data.searchRadiusKm : undefined,
      city: data.broadcastScope === "CITY" ? hospitalProfile.city : undefined,
    });
    res.status(201).json(request);
  })
);

// Public / unregistered recipients: broadcast-only, via a verified OTP
// session. Unlike hospitals, they set their location/city per request
// through the public flow itself (they have no standing profile to reuse).
const publicRequestSchema = requestCoreSchema.extend({
  lat: z.number(),
  lng: z.number(),
  city: z.string().trim().min(1).max(100).optional(),
});

router.post(
  "/public",
  requireAuth,
  requirePublicScope,
  asyncHandler(async (req, res) => {
    const data = publicRequestSchema.parse(req.body);
    const request = await svc.createRequest({
      createdByPublicId: req.user.sessionId,
      ...data,
    });
    res.status(201).json(request);
  })
);

// Independent receivers don't have a persistent account — this looks their
// past broadcasts up by the phone number on their verified OTP token
// (spanning every OTP session for that phone), so re-verifying doesn't make
// earlier requests look like they vanished.
router.get(
  "/public/mine",
  requireAuth,
  requirePublicScope,
  asyncHandler(async (req, res) => {
    res.json(await svc.listForPublicPhone(req.user.phone));
  })
);

// Access is restricted to the people involved in this request — see
// assertCanViewRequest in requests.service.js. Donors get a redacted view
// containing only their own response.
router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await svc.getById(req.params.id, req.user));
  })
);

module.exports = router;

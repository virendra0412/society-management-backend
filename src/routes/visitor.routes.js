const express = require("express");
const router = express.Router();
const visitorController = require("../controllers/visitor.controller");
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { visitor: visitorValidator } = require("../validators/phase2.validator");
const { actionLimiter } = require("../middlewares/rateLimiter.middleware");

// All visitor routes require auth + society membership
router.use(protect, requireSociety);

// ── Resident Routes ────────────────────────────────────────────────────────────
// Residents get visitors:read by default (to manage their own), so we use a
// soft check here — the service layer enforces ownership scoping for residents.
router.post(
  "/invite",
  visitorController.createInvite
);

router.get(
  "/mine",
  visitorController.getMyVisitors
);

router.patch("/:id/approve", visitorController.approveWalkIn);
router.patch("/:id/reject",  visitorController.rejectWalkIn);
router.patch("/:id/cancel",  visitorController.cancelInvite);

// ── Security / Admin / Committee (visitors:write+) ───────────────────────────

// Log a walk-in visitor
router.post(
  "/walk-in",
  requirePermission("visitors", "write"),
  validate(visitorValidator.logWalkIn),
  visitorController.logWalkIn
);

// Verify OTP and grant entry
router.post(
  "/:id/verify-otp",
  requirePermission("visitors", "write"),
  actionLimiter,
  validate(visitorValidator.verifyOTP),
  visitorController.verifyOTP
);

// Record visitor exit
router.patch(
  "/:id/exit",
  requirePermission("visitors", "write"),
  visitorController.markExit
);

// ── Admin / Security: Read all visitors ───────────────────────────────────────
router.get(
  "/",
  requirePermission("visitors", "read"),
  visitorController.getAll
);

// ── Any role: Get single visitor (residents restricted to own in service) ─────
router.get("/:id", visitorController.getOne);

// ── Trusted Visitor Routes ────────────────────────────────────────────────────

// Resident: register a new trusted visitor pass
router.post("/trusted",         validate(visitorValidator.registerTrusted), visitorController.registerTrusted);

// Resident: list their own trusted visitor passes
router.get("/trusted/mine",     visitorController.getMyTrusted);

// Security: look up trusted visitors by phone or name
router.get(
  "/trusted/lookup",
  requirePermission("visitors", "read"),
  visitorController.lookupTrusted
);

// Resident: update a trusted pass
router.patch("/trusted/:id",      validate(visitorValidator.updateTrusted), visitorController.updateTrusted);

// Resident: revoke (expire) a trusted pass immediately
router.patch("/trusted/:id/revoke", visitorController.revokeTrusted);

// Security: record auto-entry for a trusted visitor
router.post(
  "/trusted/:id/entry",
  requirePermission("visitors", "write"),
  visitorController.trustedEntry
);

module.exports = router;
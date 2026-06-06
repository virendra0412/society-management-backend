const express = require("express");
const router = express.Router();
const visitorController = require("../controllers/visitor.controller");
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { visitor: visitorValidator } = require("../validators/phase2.validator");
const { actionLimiter } = require("../middlewares/rateLimiter.middleware");

// All visitor routes require auth + society membership
router.use(protect, requireSociety);

// ── Resident Routes ────────────────────────────────────────────────────────────

// Resident creates a pre-approved invite (generates OTP)
router.post(
  "/invite",
  requireRole("resident", "admin"),
  validate(visitorValidator.createInvite),
  visitorController.createInvite
);

// Resident views their own visitor history
router.get(
  "/mine",
  requireRole("resident", "admin"),
  visitorController.getMyVisitors
);

// Resident approves a walk-in visitor awaiting their approval
router.patch(
  "/:id/approve",
  requireRole("resident", "admin"),
  visitorController.approveWalkIn
);

// Resident rejects a walk-in visitor
router.patch(
  "/:id/reject",
  requireRole("resident", "admin"),
  visitorController.rejectWalkIn
);

// GAP-5 FIX: Resident cancels their own pre-approved invite
// Sets status → "expired" and clears the OTP hash so the visitor's code is dead.
// Only works while status is still "invited" (visitor hasn't arrived yet).
router.patch(
  "/:id/cancel",
  requireRole("resident", "admin"),
  visitorController.cancelInvite
);

// ── Security / Admin Routes ────────────────────────────────────────────────────

// Security logs a walk-in visitor (no prior invite)
router.post(
  "/walk-in",
  requireRole("admin", "vendor"),   // "vendor" role used for security staff
  validate(visitorValidator.logWalkIn),
  visitorController.logWalkIn
);

// Security verifies OTP and grants entry
router.post(
  "/:id/verify-otp",
  requireRole("admin", "vendor"),
  actionLimiter,                    // prevent OTP brute-force
  validate(visitorValidator.verifyOTP),
  visitorController.verifyOTP
);

// Security records visitor exit
router.patch(
  "/:id/exit",
  requireRole("admin", "vendor"),
  visitorController.markExit
);

// ── Admin / Security: Read all visitors ───────────────────────────────────────
router.get(
  "/",
  requireRole("admin", "vendor"),
  visitorController.getAll
);

// ── Any role: Get single visitor (residents restricted to own) ────────────────
router.get("/:id", visitorController.getOne);

// ══════════════════════════════════════════════════════════════════════════════
// Flow C — Trusted / Frequent Visitor Routes
// ══════════════════════════════════════════════════════════════════════════════

// Resident: register a new trusted visitor pass
router.post(
  "/trusted",
  requireRole("resident", "admin"),
  validate(visitorValidator.registerTrusted),
  visitorController.registerTrusted
);

// Resident: list their own trusted visitor passes
router.get(
  "/trusted/mine",
  requireRole("resident", "admin"),
  visitorController.getMyTrusted
);

// Security: look up trusted visitors by phone or name (guard lookup screen)
router.get(
  "/trusted/lookup",
  requireRole("admin", "vendor"),
  visitorController.lookupTrusted
);

// Resident: update a trusted pass (schedule, passType, notes, etc.)
router.patch(
  "/trusted/:id",
  requireRole("resident", "admin"),
  validate(visitorValidator.updateTrusted),
  visitorController.updateTrusted
);

// Resident: revoke (expire) a trusted pass immediately
router.patch(
  "/trusted/:id/revoke",
  requireRole("resident", "admin"),
  visitorController.revokeTrusted
);

// Security: record auto-entry for a trusted visitor
router.post(
  "/trusted/:id/entry",
  requireRole("admin", "vendor"),
  visitorController.trustedEntry
);

module.exports = router;
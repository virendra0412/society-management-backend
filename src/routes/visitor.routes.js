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

module.exports = router;

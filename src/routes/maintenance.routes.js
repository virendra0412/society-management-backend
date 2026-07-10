const express = require("express");
const router = express.Router();
const maintenanceController = require("../controllers/maintenance.controller");
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requireRole, requirePermission } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { maintenance: maintenanceValidator } = require("../validators/phase2.validator");
const paymentSettingsRouter  = require("./paymentSettings.routes");
const reportRouter           = require("./maintenanceReport.routes");
const { requireMaintenancePaymentVerification } = require("../middlewares/module.middleware");
const Joi = require("joi");

router.use(protect, requireSociety);

// ── Reports (PDF / CSV / HTML — no gate beyond maintenance module itself) ─────
router.use("/reports", reportRouter);

// ── Payment settings (admin configures once; residents read when paying) ──────
router.use("/payment-settings", paymentSettingsRouter);

// ── Payment-verification on/off switch ─────────────────────────────────────────
// Read state via GET /modules/status (already returns paymentVerificationEnabled
// for any member — see module.controller.js). Only admin/treasurer of THIS
// society can change it here — scoped via req.user's own society, never by an
// :id param, so an admin can only ever affect their own society, not anyone else's.
router.patch(
  "/verification-status",
  requirePermission("maintenance", "write"),
  validate(Joi.object({ enabled: Joi.boolean().required() })),
  maintenanceController.setPaymentVerificationStatus
);

// ── Resident: My payments ─────────────────────────────────────────────────────
router.get(
  "/my-payments",
  requireRole("resident", "admin", "committee", "security", "vendor"),
  maintenanceController.getMyPayments
);

// ── Admin / Treasurer: Defaulter list ────────────────────────────────────────
router.get(
  "/defaulters",
  requirePermission("maintenance", "read"),
  maintenanceController.getDefaulters
);

// ── Both: List and get bills ──────────────────────────────────────────────────
router.get("/", maintenanceController.getAllBills);

// ── MUST be before /:id — otherwise "pending-verifications" is caught as a bill ID ──
router.get(
  "/pending-verifications",
  requirePermission("maintenance", "write"),
  requireMaintenancePaymentVerification,
  maintenanceController.getPendingVerifications
);

router.get("/:id", maintenanceController.getBillById);

// ── Admin / Treasurer: Manage bills ──────────────────────────────────────────
router.post(
  "/",
  requirePermission("maintenance", "write"),
  validate(maintenanceValidator.createBill),
  maintenanceController.createBill
);

router.patch(
  "/:id",
  requirePermission("maintenance", "write"),
  validate(maintenanceValidator.updateBill),
  maintenanceController.updateBill
);

// Delete a draft bill (only allowed while still draft / unpublished)
router.delete(
  "/:id",
  requirePermission("maintenance", "write"),
  maintenanceController.deleteBill
);

// Publish bill → generates payment records + notifies residents
router.patch(
  "/:id/publish",
  requirePermission("maintenance", "write"),
  maintenanceController.publishBill
);

// Close bill
router.patch(
  "/:id/close",
  requirePermission("maintenance", "write"),
  maintenanceController.closeBill
);

// Apply late penalty to all overdue records in a bill
router.patch(
  "/:id/apply-penalty",
  requirePermission("maintenance", "write"),
  maintenanceController.applyPenalty
);

// ── Admin / Treasurer: Manage individual payment records ─────────────────────

// Record a flat's payment
router.patch(
  "/:billId/payments/:paymentId",
  requirePermission("maintenance", "write"),
  validate(maintenanceValidator.recordPayment),
  maintenanceController.recordPayment
);

// Apply a discount to a specific flat's payment record
router.patch(
  "/:billId/payments/:paymentId/discount",
  requirePermission("maintenance", "write"),
  validate(maintenanceValidator.applyDiscount),
  maintenanceController.applyDiscount
);

// ── Manual proof workflow ─────────────────────────────────────────────────────
// NOTE: every route in this block additionally carries
// requireMaintenancePaymentVerification, so SA can pause just this flow
// (via society.paymentVerificationEnabled) without touching bill
// creation/viewing above, which stay behind requireModule("maintenance") only.

// Resident: submit proof of offline payment (cash/bank transfer/UPI QR/cheque)
router.post(
  "/:billId/payments/:paymentId/submit-proof",
  requireRole("resident"),
  requireMaintenancePaymentVerification,
  validate(maintenanceValidator.submitPaymentProof),
  maintenanceController.submitPaymentProof
);

// Admin: verify a submitted proof → marks paid
router.patch(
  "/:billId/payments/:paymentId/verify",
  requirePermission("maintenance", "write"),
  requireMaintenancePaymentVerification,
  maintenanceController.verifyPayment
);

// Admin: reject a submitted proof → back to unpaid, resident can resubmit
router.patch(
  "/:billId/payments/:paymentId/reject",
  requirePermission("maintenance", "write"),
  requireMaintenancePaymentVerification,
  validate(maintenanceValidator.rejectPayment),
  maintenanceController.rejectPayment
);

module.exports = router;
const express = require("express");
const router = express.Router();
const maintenanceController = require("../controllers/maintenance.controller");
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requireRole, requirePermission } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { maintenance: maintenanceValidator } = require("../validators/phase2.validator");

router.use(protect, requireSociety);

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

module.exports = router;
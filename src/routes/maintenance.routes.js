const express = require("express");
const router = express.Router();
const maintenanceController = require("../controllers/maintenance.controller");
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { maintenance: maintenanceValidator } = require("../validators/phase2.validator");

router.use(protect, requireSociety);

// ── Resident: My payments ─────────────────────────────────────────────────────
// (defined before /:id to avoid conflict)
router.get(
  "/my-payments",
  requireRole("resident", "admin"),
  maintenanceController.getMyPayments
);

// ── Both: List and get bills ──────────────────────────────────────────────────
router.get("/", maintenanceController.getAllBills);
router.get("/:id", maintenanceController.getBillById);

// ── Admin: Manage bills ───────────────────────────────────────────────────────
router.post(
  "/",
  requireRole("admin"),
  validate(maintenanceValidator.createBill),
  maintenanceController.createBill
);

router.patch(
  "/:id",
  requireRole("admin"),
  validate(maintenanceValidator.updateBill),
  maintenanceController.updateBill
);

// Publish bill → generates payment records + notifies residents
router.patch(
  "/:id/publish",
  requireRole("admin"),
  maintenanceController.publishBill
);

// Close bill
router.patch(
  "/:id/close",
  requireRole("admin"),
  maintenanceController.closeBill
);

// Apply late penalty to all overdue records in a bill
router.patch(
  "/:id/apply-penalty",
  requireRole("admin"),
  maintenanceController.applyPenalty
);

// ── Admin: Manage individual payment records ──────────────────────────────────

// Record a flat's payment
router.patch(
  "/:billId/payments/:paymentId",
  requireRole("admin"),
  validate(maintenanceValidator.recordPayment),
  maintenanceController.recordPayment
);

// Apply a discount to a specific flat's payment record
router.patch(
  "/:billId/payments/:paymentId/discount",
  requireRole("admin"),
  validate(maintenanceValidator.applyDiscount),
  maintenanceController.applyDiscount
);

module.exports = router;

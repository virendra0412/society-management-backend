/**
 * routes/maintenanceReport.routes.js
 *
 * Mounted at: /api/v1/maintenance/reports
 * (Registered inside maintenance.routes.js — already gated by
 *  protect + requireSociety + requireModule("maintenance"))
 *
 * ?format=html  → print-ready HTML (default)
 * ?format=csv   → Excel-compatible CSV download
 *
 * Access:
 *   Residents  → history (own) and receipt (own paid records) only
 *   Admin/Treasurer → all 5 reports, any resident's history
 */

const express     = require("express");
const router      = express.Router();
const ctrl        = require("../controllers/maintenanceReport.controller");
const { requirePermission, requireRole } = require("../middlewares/role.middleware");

// ── 1. Maintenance Bill (all flats) ──────────────────────────────────────────
// Admin / treasurer only — contains all residents' data
router.get(
  "/bill/:billId",
  requirePermission("maintenance", "read"),
  ctrl.billReport
);

// ── 2. Payment Receipt (single flat) ─────────────────────────────────────────
// Any authenticated member — controller enforces ownership for residents
router.get(
  "/receipt/:billId/:paymentId",
  ctrl.receiptReport
);

// ── 3. Monthly Collection Report ──────────────────────────────────────────────
// Admin / treasurer only
router.get(
  "/collection",
  requirePermission("maintenance", "read"),
  ctrl.collectionReport
);

// ── 4. Resident Payment History ───────────────────────────────────────────────
// Residents see their own; admin can pass ?residentId=xxx for any resident
router.get(
  "/history",
  ctrl.historyReport
);

// ── 5. Society Financial Summary ──────────────────────────────────────────────
// Admin / treasurer only
router.get(
  "/summary",
  requirePermission("maintenance", "read"),
  ctrl.summaryReport
);

module.exports = router;

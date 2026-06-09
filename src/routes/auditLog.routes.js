/**
 * routes/auditLog.routes.js
 *
 * Mounted at /api/v1 in routes/index.js — see MOUNT INSTRUCTIONS below.
 *
 * Routes:
 *   GET /audit-logs           — paginated audit log (admin only)
 *   GET /audit-logs/summary   — 30-day action count summary (admin only)
 *
 * ─── MOUNT INSTRUCTIONS (routes/index.js) ────────────────────────────────────
 * Add these two lines:
 *
 *   // near the top with other requires:
 *   const auditLogRoutes = require("./auditLog.routes");
 *
 *   // in the mount section (after moduleRoutes):
 *   router.use("/audit-logs", protect, requireSociety, auditLogRoutes);
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express            = require("express");
const router             = express.Router();
const auditLogController = require("../controllers/auditLog.controller");
const { requireRole }    = require("../middlewares/role.middleware");

// Both endpoints are admin-only
router.use(requireRole("admin"));

router.get("/",        auditLogController.getLogs);
router.get("/summary", auditLogController.getSummary);

module.exports = router;
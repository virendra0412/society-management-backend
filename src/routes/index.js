const express = require("express");
const router  = express.Router();

const { requireModule } = require("../middlewares/module.middleware");
const { protect, requireSociety } = require("../middlewares/auth.middleware");

// ─── Super Admin Routes ───────────────────────────────────────────────────────
const superAdminRoutes = require("./superAdmin.routes");

// ─── Phase 1 Routes ───────────────────────────────────────────────────────────
const authRoutes    = require("./auth.routes");
const userRoutes    = require("./user.routes");
const issueRoutes   = require("./issue.routes");
const {
  helpRouter,
  noticeRouter,
  pollRouter,
  contactRouter,
} = require("./resource.routes");

// ─── Phase 2 Routes ───────────────────────────────────────────────────────────
const visitorRoutes     = require("./visitor.routes");
const maintenanceRoutes = require("./maintenance.routes");
const amenityRoutes     = require("./amenity.routes");
const eventRoutes       = require("./event.routes");
const parkingRoutes     = require("./parking.routes");
const moduleRoutes      = require("./module.routes");
const { inviteRouter, inviteVerifyRouter } = require("./inviteLink.routes");
const auditLogRoutes = require("./auditLog.routes");

// ─── Payments (Razorpay) ──────────────────────────────────────────────────────
// NOTE: the raw-body webhook endpoint (/api/v1/payments/webhook) is mounted
// directly in app.js, BEFORE express.json(), and is therefore NOT part of
// this router. Only the authenticated, JSON-bodied payment routes live here.
const paymentRoutes = require("./payment.routes");

// ─── Mount Routes ─────────────────────────────────────────────────────────────

// Auth & user — no module gate
router.use("/auth",     authRoutes);
router.use("/users",    userRoutes);

// Free modules — always available (requireModule skips these automatically,
// but listed explicitly for clarity)
router.use("/notices",  requireModule("notices"),  noticeRouter);
router.use("/polls",    requireModule("polls"),    pollRouter);
router.use("/contacts", requireModule("contacts"), contactRouter);

// Paid modules — gated by feature flag
router.use("/issues",      protect, requireSociety, requireModule("issues"),      issueRoutes);
router.use("/help",        protect, requireSociety, requireModule("community"),   helpRouter);       // community module
router.use("/visitors",    protect, requireSociety, requireModule("visitors"),    visitorRoutes);
router.use("/maintenance", protect, requireSociety, requireModule("maintenance"), maintenanceRoutes);
router.use("/amenities",   protect, requireSociety, requireModule("amenities"),   amenityRoutes);
router.use("/events",      protect, requireSociety, requireModule("events"),      eventRoutes);
router.use("/parking",     protect, requireSociety, requireModule("parking"),     parkingRoutes);

// Society module status + upgrade requests
router.use("/modules", moduleRoutes);

// Subscription payments — Razorpay (auth handled inside payment.routes.js)
router.use("/payments", paymentRoutes);

// Invite link — admin generates, public verifies
router.use("/society",     inviteRouter);          // POST /society/:id/invite-link
router.use("/invite-link", inviteVerifyRouter);    // GET  /invite-link/verify

router.use("/audit-logs", protect, requireSociety, auditLogRoutes);

// Super Admin — multi-society platform management
router.use("/superadmin", superAdminRoutes);

module.exports = router;
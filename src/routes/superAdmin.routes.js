/**
 * Super Admin Routes
 * Base path: /api/v1/superadmin
 *
 * Auth strategy:
 *   Public  — no token needed (society apply, health)
 *   SA Auth — super admin JWT required (protectSuperAdmin)
 *
 * Route map:
 * ─────────────────────────────────────────────────────────────────────────────
 * Auth
 *   POST  /superadmin/auth/login
 *   POST  /superadmin/auth/refresh
 *   POST  /superadmin/auth/logout
 *   GET   /superadmin/auth/me
 *   PATCH /superadmin/auth/change-password
 *
 * Applications (society onboarding)
 *   POST  /superadmin/applications              ← PUBLIC: society owner applies
 *   GET   /superadmin/applications              list + filter by status
 *   GET   /superadmin/applications/:id          single application
 *   PATCH /superadmin/applications/:id/approve  approve → creates society
 *   PATCH /superadmin/applications/:id/reject   reject with reason
 *
 * Societies
 *   GET   /superadmin/societies                 list all (with subscription)
 *   GET   /superadmin/societies/:id             single + subscription detail
 *   PATCH /superadmin/societies/:id/subscription  change plan / status / dates
 *   PATCH /superadmin/societies/:id/custom-pricing  set/clear a negotiated per-society rate
 *   PATCH /superadmin/societies/:id/suspend
 *   PATCH /superadmin/societies/:id/reactivate
 *   PATCH /superadmin/societies/:id/transfer-admin
 *   POST  /superadmin/societies/:id/reset-admin-password
 *
 * Analytics
 *   GET   /superadmin/analytics/overview         global platform stats
 *   GET   /superadmin/analytics/societies/:id    per-society stats
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express    = require("express");
const router     = express.Router();
const authCtrl   = require("../controllers/superAdmin.auth.controller");
const ctrl       = require("../controllers/superAdmin.controller");
const { protectSuperAdmin } = require("../middlewares/superAdmin.middleware");
const { validate }          = require("../middlewares/validate.middleware");
const v                     = require("../validators/superAdmin.validator");
const { authLimiter, actionLimiter } = require("../middlewares/rateLimiter.middleware");

// ── Auth ──────────────────────────────────────────────────────────────────────
router.post("/auth/login",           authLimiter,   validate(v.login),          authCtrl.login);
router.post("/auth/refresh",                        validate(v.refreshToken),    authCtrl.refreshToken);
router.post("/auth/logout",          protectSuperAdmin,                          authCtrl.logout);
router.get ("/auth/me",              protectSuperAdmin,                          authCtrl.me);
router.patch("/auth/change-password",protectSuperAdmin, validate(v.changePassword), authCtrl.changePassword);

// ── Applications (public apply endpoint + protected review) ──────────────────
router.post("/applications",
  actionLimiter,
  validate(v.applyForSociety),
  ctrl.applyForSociety
);

router.get ("/applications",        protectSuperAdmin, ctrl.listApplications);
router.get ("/applications/:id",    protectSuperAdmin, ctrl.getApplication);
router.patch("/applications/:id/approve",
  protectSuperAdmin,
  validate(v.reviewApplication),
  ctrl.approveApplication
);
router.patch("/applications/:id/reject",
  protectSuperAdmin,
  validate(v.reviewApplication),
  ctrl.rejectApplication
);

// ── Societies ─────────────────────────────────────────────────────────────────
router.get ("/societies",           protectSuperAdmin, ctrl.listSocieties);
router.get ("/societies/:id",       protectSuperAdmin, ctrl.getSociety);

router.patch("/societies/:id/subscription",
  protectSuperAdmin,
  validate(v.updateSubscription),
  ctrl.updateSubscription
);
router.patch("/societies/:id/custom-pricing",
  protectSuperAdmin,
  validate(v.setCustomPricing),
  ctrl.setCustomPricing
);
router.patch("/societies/:id/suspend",
  protectSuperAdmin,
  validate(v.suspendSociety),
  ctrl.suspendSociety
);
router.patch("/societies/:id/reactivate",
  protectSuperAdmin,
  validate(v.reactivateSociety),
  ctrl.reactivateSociety
);
router.patch("/societies/:id/transfer-admin",
  protectSuperAdmin,
  validate(v.transferAdmin),
  ctrl.transferAdmin
);
router.post("/societies/:id/reset-admin-password",
  protectSuperAdmin,
  ctrl.resetAdminPassword
);

// ── Analytics ─────────────────────────────────────────────────────────────────
router.get("/analytics/overview",           protectSuperAdmin, ctrl.getGlobalAnalytics);
router.get("/analytics/societies/:id",      protectSuperAdmin, ctrl.getSocietyAnalytics);

module.exports = router;

// ── Module Management ──────────────────────────────────────────────────────────
// GET  /superadmin/societies/:id/modules         get module status for a society
// PATCH /superadmin/societies/:id/modules        toggle modules / set custom charges
// POST  /superadmin/societies/:id/modules/bundle apply a pre-defined bundle
// GET  /superadmin/modules/upgrade-requests      list all pending upgrade requests
// POST  /api/v1/societies/:id/modules/request-upgrade  (resident-facing, handled in user routes)
router.get   ("/societies/:id/modules",         protectSuperAdmin, ctrl.getModules);
router.patch ("/societies/:id/modules",         protectSuperAdmin, validate(v.updateModules), ctrl.updateModules);
router.post  ("/societies/:id/modules/bundle",  protectSuperAdmin, validate(v.applyBundle),   ctrl.applyBundle);
router.get   ("/modules/upgrade-requests",      protectSuperAdmin, ctrl.listUpgradeRequests);
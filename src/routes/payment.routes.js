/**
 * routes/payment.routes.js
 * Base path: /api/v1/payments
 *
 * NOTE: POST /payments/webhook is mounted separately in app.js BEFORE
 * express.json() using express.raw() — it is NOT in this router.
 *
 * Route map:
 *   GET  /payments/pricing                         any member — standard price table
 *   GET  /payments/my-pricing                      any member — this society's effective prices
 *
 *   POST /payments/subscription/create-order       admin — buy/renew a plan
 *   GET  /payments/subscription/history            admin — past payments
 *
 *   GET  /payments/upgrade/preview                 admin — see credit+charge before upgrade
 *   POST /payments/upgrade/create-order            admin — mid-cycle plan upgrade
 *
 *   GET  /payments/modules/preview                 admin — prorated price preview
 *   POST /payments/modules/create-order            admin — buy specific modules à la carte
 *
 *   POST /payments/subscription/verify             admin — confirm payment (all 3 flows)
 */
const express = require("express");
const router  = express.Router();

const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requireRole }             = require("../middlewares/role.middleware");
const { validate, validateQuery } = require("../middlewares/validate.middleware");
const { actionLimiter }           = require("../middlewares/rateLimiter.middleware");
const ctrl                        = require("../controllers/payment.controller");
const v                           = require("../validators/payment.validator");

router.use(protect, requireSociety);

// ── Pricing (read-only, any member) ─────────────────────────────────────────
router.get("/pricing",    ctrl.getPricing);
router.get("/my-pricing", ctrl.getMyPricing);

// ── Plan purchase / renewal ──────────────────────────────────────────────────
router.post(
  "/subscription/create-order",
  requireRole("admin"),
  actionLimiter,
  validate(v.createOrder),
  ctrl.createOrder
);

// ── Mid-cycle plan upgrade ────────────────────────────────────────────────────
router.get(
  "/upgrade/preview",
  requireRole("admin"),
  validateQuery(v.previewUpgrade),
  ctrl.previewUpgrade
);

router.post(
  "/upgrade/create-order",
  requireRole("admin"),
  actionLimiter,
  validate(v.createUpgradeOrder),
  ctrl.createUpgradeOrder
);

// ── Module purchase (à la carte) ─────────────────────────────────────────────
router.get(
  "/modules/preview",
  requireRole("admin"),
  // modules passed as comma-separated string: ?modules=visitors,maintenance
  // controller splits it — no Joi schema needed on the query for this route
  ctrl.previewModules
);

router.post(
  "/modules/create-order",
  requireRole("admin"),
  actionLimiter,
  validate(v.createModulesOrder),
  ctrl.createModulesOrder
);

// ── Shared verify (plan + upgrade + modules) ──────────────────────────────────
router.post(
  "/subscription/verify",
  requireRole("admin"),
  actionLimiter,
  validate(v.verifyPayment),
  ctrl.verifyPayment
);

// ── Payment history ───────────────────────────────────────────────────────────
router.get(
  "/subscription/history",
  requireRole("admin"),
  ctrl.getHistory
);

module.exports = router;

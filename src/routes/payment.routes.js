/**
 * routes/payment.routes.js
 * Base path: /api/v1/payments
 *
 * NOTE: the webhook route (POST /payments/webhook) is NOT exported from this
 * file. It is mounted separately and earlier in app.js, before the global
 * express.json() middleware, because it needs raw-body access for HMAC
 * signature verification. See app.js for the full explanation.
 *
 * Route map:
 *   GET  /payments/pricing                       any logged-in user — standard price table
 *   GET  /payments/my-pricing                     any logged-in user — effective price for THIS society (custom or standard), plan AND per-module
 *   POST /payments/subscription/create-order      admin only — start a plan payment
 *   POST /payments/modules/create-order            admin only — start a "pick your own modules" payment
 *   POST /payments/subscription/verify             admin only — confirm payment (serves both flows above)
 *   GET  /payments/subscription/history            admin only — past payments
 */
const express = require("express");
const router  = express.Router();

const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requireRole }             = require("../middlewares/role.middleware");
const { validate }                = require("../middlewares/validate.middleware");
const { actionLimiter }           = require("../middlewares/rateLimiter.middleware");
const ctrl                        = require("../controllers/payment.controller");
const v                           = require("../validators/payment.validator");

router.use(protect, requireSociety);

router.get("/pricing", ctrl.getPricing);
router.get("/my-pricing", ctrl.getMyPricing);

router.post(
  "/subscription/create-order",
  requireRole("admin"),
  actionLimiter,
  validate(v.createOrder),
  ctrl.createOrder
);

router.post(
  "/modules/create-order",
  requireRole("admin"),
  actionLimiter,
  validate(v.createModulesOrder),
  ctrl.createModulesOrder
);

router.post(
  "/subscription/verify",
  requireRole("admin"),
  actionLimiter,
  validate(v.verifyPayment),
  ctrl.verifyPayment
);

router.get(
  "/subscription/history",
  requireRole("admin"),
  ctrl.getHistory
);

module.exports = router;
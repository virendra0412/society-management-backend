/**
 * module.middleware.js
 *
 * Gate any route behind a feature-flag check.
 * Reads enabledModules directly from the Society document (not cached in JWT
 * so SA changes take effect immediately without forcing re-login).
 *
 * Usage:
 *   router.use("/visitors",    requireModule("visitors"),    visitorRouter);
 *   router.use("/maintenance", requireModule("maintenance"), maintenanceRouter);
 *
 * Free modules (notices, polls, contacts) always pass — no DB hit needed.
 */

const { Society, FREE_MODULES } = require("../models/society.model");
const AppError = require("../utils/AppError");

/**
 * Middleware factory.
 * @param {string} moduleKey  - key from MODULE_KEYS (e.g. "visitors")
 */
const requireModule = (moduleKey) => async (req, res, next) => {
  // Free modules are always accessible — skip DB lookup
  if (FREE_MODULES.includes(moduleKey)) return next();

  const societyId = req.societyId;
  if (!societyId) {
    return next(AppError.forbidden("Society context is required."));
  }

  // Fetch only the enabledModules field — lean for performance
  const society = await Society.findById(societyId, "enabledModules isActive").lean();
  if (!society) {
    return next(AppError.notFound("Society not found."));
  }
  if (!society.isActive) {
    return next(AppError.forbidden("This society account is suspended."));
  }

  const isEnabled = society.enabledModules?.[moduleKey] === true;
  if (!isEnabled) {
    return next(
      AppError.forbidden(
        `The '${moduleKey}' module is not enabled for your society. Contact your administrator to upgrade.`,
        "MODULE_NOT_ENABLED"
      )
    );
  }

  next();
};

/**
 * Gate the maintenance *payment-verification* flow specifically
 * (submit-proof, verify, reject, pending-verifications queue).
 *
 * This is separate from requireModule("maintenance"): that gate already runs
 * first at the router mount point in routes/index.js, so by the time this
 * middleware runs we know maintenance itself is enabled. This just adds a
 * narrower on/off switch for verification only — bill creation and viewing
 * are unaffected by this flag.
 *
 * Usage:
 *   router.post("/:billId/payments/:paymentId/submit-proof",
 *     requireRole("resident"), requireMaintenancePaymentVerification, ...);
 */
const requireMaintenancePaymentVerification = async (req, res, next) => {
  const societyId = req.societyId;
  if (!societyId) {
    return next(AppError.forbidden("Society context is required."));
  }

  const society = await Society.findById(societyId, "paymentVerificationEnabled isActive").lean();
  if (!society) {
    return next(AppError.notFound("Society not found."));
  }
  if (!society.isActive) {
    return next(AppError.forbidden("This society account is suspended."));
  }

  // Default to enabled for societies created before this flag existed.
  const isEnabled = society.paymentVerificationEnabled !== false;
  if (!isEnabled) {
    return next(
      AppError.forbidden(
        "Maintenance payment verification is temporarily disabled for your society. " +
        "You can still view and create bills. Contact your administrator for details.",
        "PAYMENT_VERIFICATION_DISABLED"
      )
    );
  }

  next();
};

module.exports = { requireModule, requireMaintenancePaymentVerification };
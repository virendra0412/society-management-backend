/**
 * module.routes.js
 * Society-admin-facing module endpoints.
 *
 * Base path: /api/v1/modules
 *
 * GET  /modules/status            → see which modules are enabled (read-only for admin)
 * POST /modules/request-upgrade   → request SA to enable a module
 */

const express = require("express");
const router  = express.Router();
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requireRole }             = require("../middlewares/role.middleware");
const moduleCtrl                  = require("../controllers/module.controller");
const { validate }                = require("../middlewares/validate.middleware");
const Joi                         = require("joi");
const { PAID_MODULES }            = require("../models/society.model");

const requestUpgradeSchema = Joi.object({
  module: Joi.string().valid(...PAID_MODULES).required(),
});

// All module routes require auth + society context
router.use(protect, requireSociety);

// Any member can view what modules are enabled
router.get("/status", moduleCtrl.getModuleStatus);

// Only admin can submit an upgrade request
router.post(
  "/request-upgrade",
  requireRole("admin"),
  validate(requestUpgradeSchema),
  moduleCtrl.requestUpgrade
);

module.exports = router;
/**
 * module.controller.js
 * Society-facing module status and upgrade request endpoints.
 */

const superAdminService = require("../services/superAdmin.service");
const { sendSuccess }   = require("../utils/response");
const { Society, FREE_MODULES, PAID_MODULES, DEFAULT_MODULE_PRICES, MODULE_BUNDLES }
  = require("../models/society.model");

class ModuleController {

  /**
   * GET /api/v1/modules/status
   * Any authenticated society member can call this to discover
   * which modules their society has access to.
   */
  async getModuleStatus(req, res) {
    const society = await Society.findById(req.societyId, "enabledModules moduleCharges upgradeRequests name").lean();
    if (!society) throw require("../utils/AppError").notFound("Society not found.");

    const modules = {};
    const allKeys = [...FREE_MODULES, ...PAID_MODULES];
    for (const key of allKeys) {
      const isFree = FREE_MODULES.includes(key);
      modules[key] = {
        enabled:   isFree ? true : (society.enabledModules?.[key] ?? false),
        isFree,
        charge:    isFree ? 0 : (society.moduleCharges?.[key] ?? DEFAULT_MODULE_PRICES[key] ?? 0),
        // Show pending request if any (so admin knows a request is in flight)
        pendingRequest: !isFree
          ? (society.upgradeRequests || []).some(r => r.module === key && r.status === "pending")
          : false,
      };
    }

    return sendSuccess(res, { data: { societyName: society.name, modules, bundles: MODULE_BUNDLES } });
  }

  /**
   * POST /api/v1/modules/request-upgrade
   * Admin submits an upgrade request for a locked module.
   *
   * FALLBACK PATH ONLY — the mobile app's primary flow is now
   * POST /payments/modules/create-order (immediate Razorpay payment that
   * enables the module on success, no human review). This endpoint stays
   * for societies where RAZORPAY_KEY_ID isn't configured on the server
   * (config/razorpay.js returns 503 from the payment routes in that case),
   * so there's still a way to ask for a module without online payment.
   */
  async requestUpgrade(req, res) {
    const result = await superAdminService.requestModuleUpgrade(req.societyId, req.body.module);
    return sendSuccess(res, { message: result.message });
  }
}

module.exports = new ModuleController();
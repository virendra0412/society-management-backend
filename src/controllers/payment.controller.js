/**
 * controllers/payment.controller.js
 */
const paymentService   = require("../services/payment.service");
const { sendSuccess }  = require("../utils/response");
const { getAllPricing } = require("../config/pricing");

class PaymentController {
  // ── Pricing ─────────────────────────────────────────────────────────────────

  /** GET /api/v1/payments/pricing — standard price table, all plans × cycles */
  async getPricing(req, res) {
    return sendSuccess(res, { data: getAllPricing() });
  }

  /**
   * GET /api/v1/payments/my-pricing
   * Effective prices for this society — returns custom negotiated rate when
   * a Super Admin has set one, otherwise the standard table.
   */
  async getMyPricing(req, res) {
    const result = await paymentService.getMyEffectivePricing(req.societyId);
    return sendSuccess(res, { data: result });
  }

  // ── Plan purchase / renewal ──────────────────────────────────────────────────

  /**
   * POST /api/v1/payments/subscription/create-order
   * Body: { plan, billingCycle }
   */
  async createOrder(req, res) {
    const result = await paymentService.createSubscriptionOrder(
      req.societyId, req.user._id, req.body
    );
    return sendSuccess(res, { statusCode: 201, message: "Order created.", data: result });
  }

  // ── Mid-cycle plan upgrade ───────────────────────────────────────────────────

  /**
   * GET /api/v1/payments/upgrade/preview?plan=professional&billingCycle=monthly
   * Returns upgrade cost breakdown BEFORE creating an order:
   *   { fromPlan, toPlan, daysLeft, creditRupees, chargeRupees, renewalDate }
   * Show this to the admin so they see exactly what they'll pay.
   */
  async previewUpgrade(req, res) {
    const { plan, billingCycle } = req.query;
    const result = await paymentService.previewUpgrade(req.societyId, { plan, billingCycle });
    return sendSuccess(res, { data: result });
  }

  /**
   * POST /api/v1/payments/upgrade/create-order
   * Body: { plan, billingCycle }
   * Creates a mid-cycle upgrade order — charges prorated delta after crediting
   * unused days from the current plan. On verify, plan switches immediately
   * but the renewal date stays the same.
   */
  async createUpgradeOrder(req, res) {
    const result = await paymentService.createUpgradeOrder(
      req.societyId, req.user._id, req.body
    );
    return sendSuccess(res, { statusCode: 201, message: "Upgrade order created.", data: result });
  }

  // ── Module purchase (à la carte) ────────────────────────────────────────────

  /**
   * GET /api/v1/payments/modules/preview?modules=visitors,maintenance
   * Returns prorated price breakdown per module BEFORE checkout.
   *   { modules, breakdown, amountRupees, isProrated, renewalDate }
   */
  async previewModules(req, res) {
    const raw        = req.query.modules || "";
    const moduleKeys = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const result     = await paymentService.previewModulesPricing(req.societyId, moduleKeys);
    return sendSuccess(res, { data: result });
  }

  /**
   * POST /api/v1/payments/modules/create-order
   * Body: { modules: ["visitors", "maintenance", ...] }
   * Payment success enables the selected module(s) immediately — replaces the
   * old "Request Upgrade → wait for SA" flow entirely.
   */
  async createModulesOrder(req, res) {
    const result = await paymentService.createModulesOrder(
      req.societyId, req.user._id, req.body.modules
    );
    return sendSuccess(res, { statusCode: 201, message: "Order created.", data: result });
  }

  // ── Shared verify (plan + upgrade + modules) ─────────────────────────────────

  /**
   * POST /api/v1/payments/subscription/verify
   * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
   * Single endpoint for all three purchase types — the Payment record's
   * purchaseType field tells the service which effect to apply.
   */
  async verifyPayment(req, res) {
    const { alreadyProcessed, payment } = await paymentService.verifyAndApplyPayment(
      req.societyId, req.user._id, req.body
    );
    return sendSuccess(res, {
      message: alreadyProcessed ? "Payment already confirmed." : "Payment verified — subscription updated.",
      data: { paymentId: payment._id, status: payment.status },
    });
  }

  /** GET /api/v1/payments/subscription/history */
  async getHistory(req, res) {
    const { page, limit } = req.query;
    const result = await paymentService.getPaymentHistory(req.societyId, {
      page: Number(page) || 1, limit: Number(limit) || 20,
    });
    return sendSuccess(res, { data: result });
  }

  /**
   * POST /api/v1/payments/webhook
   * Server-to-server from Razorpay. Mounted with express.raw() in app.js.
   * razorpayWebhookAuth verifies + parses the body before this handler runs.
   */
  async webhook(req, res) {
    await paymentService.handleWebhookEvent(req.body);
    return res.status(200).json({ received: true });
  }
}

module.exports = new PaymentController();

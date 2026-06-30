/**
 * controllers/payment.controller.js
 */
const paymentService   = require("../services/payment.service");
const { sendSuccess }  = require("../utils/response");
const { getAllPricing } = require("../config/pricing");

class PaymentController {
  /**
   * GET /api/v1/payments/pricing
   * Public-ish (but still requires login — no need to expose to the world).
   * Frontend uses this to render the upgrade screen's price cards without
   * hardcoding numbers on the client.
   */
  async getPricing(req, res) {
    return sendSuccess(res, { data: getAllPricing() });
  }

  /**
   * GET /api/v1/payments/my-pricing
   * The EFFECTIVE price for the logged-in society — shows their custom
   * negotiated rate (if a Super Admin set one) instead of the standard
   * plan table. Use this on the upgrade screen instead of /pricing when
   * you want to show "your price" rather than the generic price list.
   */
  async getMyPricing(req, res) {
    const result = await paymentService.getMyEffectivePricing(req.societyId);
    return sendSuccess(res, { data: result });
  }

  /**
   * POST /api/v1/payments/subscription/create-order
   * Body: { plan: "basic"|"premium", billingCycle: "monthly"|"quarterly"|"halfyearly"|"annual" }
   */
  async createOrder(req, res) {
    const result = await paymentService.createSubscriptionOrder(
      req.societyId,
      req.user._id,
      req.body
    );
    return sendSuccess(res, {
      statusCode: 201,
      message: "Order created.",
      data: result,
    });
  }

  /**
   * POST /api/v1/payments/modules/create-order
   * Body: { modules: ["visitors", "maintenance", ...] }
   *
   * "Pick your own modules" checkout — replaces the old manual
   * request-upgrade-then-wait-for-SA flow. Payment success enables the
   * selected module(s) immediately (see verifyPayment / webhook below).
   */
  async createModulesOrder(req, res) {
    const result = await paymentService.createModulesOrder(
      req.societyId,
      req.user._id,
      req.body.modules
    );
    return sendSuccess(res, {
      statusCode: 201,
      message: "Order created.",
      data: result,
    });
  }

  /**
   * POST /api/v1/payments/subscription/verify
   * Called by the mobile app's Razorpay Checkout success handler.
   * Serves BOTH purchase flows — the Payment record (looked up by
   * razorpay_order_id) already knows whether it's a "plan" or "modules"
   * purchase via its purchaseType field, so this single endpoint branches
   * internally rather than needing two separate verify routes.
   */
  async verifyPayment(req, res) {
    const { alreadyProcessed, payment } = await paymentService.verifyAndApplyPayment(
      req.societyId,
      req.user._id,
      req.body
    );
    return sendSuccess(res, {
      message: alreadyProcessed
        ? "Payment already confirmed."
        : "Payment verified — subscription updated.",
      data: { paymentId: payment._id, status: payment.status },
    });
  }

  /**
   * GET /api/v1/payments/subscription/history
   */
  async getHistory(req, res) {
    const { page, limit } = req.query;
    const result = await paymentService.getPaymentHistory(req.societyId, {
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
    return sendSuccess(res, { data: result });
  }

  /**
   * POST /api/v1/payments/webhook
   * Server-to-server call from Razorpay. NOT behind `protect` middleware —
   * authenticated via HMAC signature instead (see razorpayWebhookAuth in
   * middlewares/razorpayWebhook.middleware.js, applied before this route
   * in app.js using express.raw()).
   *
   * Always returns 200 quickly — Razorpay retries on non-2xx, and we've
   * already validated the signature in the raw-body middleware before this
   * handler runs, so by the time we're here the payload is trusted.
   */
  async webhook(req, res) {
    // req.body is the parsed JSON (see razorpayWebhook.middleware.js — it
    // verifies against the raw Buffer, then attaches the parsed object here).
    await paymentService.handleWebhookEvent(req.body);
    return res.status(200).json({ received: true });
  }
}

module.exports = new PaymentController();
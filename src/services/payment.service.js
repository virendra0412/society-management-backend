/**
 * services/payment.service.js
 *
 * Core Razorpay business logic. Three entry points:
 *
 *   1. createSubscriptionOrder()  → POST /payments/subscription/create-order
 *      Society admin picks a plan + cycle. We create a Razorpay Order and
 *      a local Payment record (status: "created"). Frontend opens Razorpay
 *      Checkout with the returned order id.
 *
 *   2. verifyAndApplyPayment()    → POST /payments/subscription/verify
 *      Frontend calls this immediately after Razorpay Checkout succeeds
 *      (handler callback), passing back razorpay_order_id, razorpay_payment_id,
 *      razorpay_signature. We verify the HMAC signature, then extend the
 *      society's Subscription.
 *
 *   3. handleWebhookEvent()       → POST /payments/webhook
 *      Safety net in case step 2 never runs (app killed right after payment,
 *      network drop, etc). Razorpay calls this server-to-server. We verify
 *      a DIFFERENT signature (webhook secret, not key secret) and apply the
 *      same subscription update — guarded by Payment.status to stay idempotent.
 */
const crypto = require("crypto");

const { getRazorpayClient } = require("../config/razorpay");
const { getPricing, getAllPricing } = require("../config/pricing");
const { Payment }           = require("../models/payment.model");
const { Subscription }      = require("../models/subscription.model");
const Society                = require("../models/society.model").Society;
const AppError              = require("../utils/AppError");
const logger                = require("../utils/logger");
const { notifySociety }     = require("../utils/notification");

const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";

class PaymentService {
  /**
   * Step 1 — Create a Razorpay Order for a subscription plan purchase.
   * Amount is always computed server-side — never trust a client-supplied
   * amount. Two sources, checked in order:
   *
   *   1. Subscription.customPricing — if a Super Admin has set a negotiated
   *      rate for THIS society (e.g. ₹10 pilot, ₹299 discount), that rate is
   *      used as the monthly base instead of config/pricing.js's standard
   *      BASE_MONTHLY_RUPEES.
   *   2. config/pricing.js standard rate — used for every other society.
   *
   * This is what makes per-society pricing actually take effect at checkout
   * time, not just display as a number in the admin panel.
   */
  async createSubscriptionOrder(societyId, adminUserId, { plan, billingCycle }) {
    const society = await Society.findById(societyId).select("name");
    if (!society) throw AppError.notFound("Society not found.");

    const sub = await Subscription.findOne({ society: societyId });
    const customMonthlyRupees =
      sub?.customPricing?.enabled && sub.customPricing.monthlyRupees != null
        ? sub.customPricing.monthlyRupees
        : null;

    const { amountRupees, amountPaise, months, isCustomPricing } =
      getPricing(plan, billingCycle, customMonthlyRupees);

    const razorpay = getRazorpayClient();

    // Razorpay receipt must be ≤ 40 chars
    const receipt = `sub_${societyId.toString().slice(-8)}_${Date.now().toString().slice(-8)}`;

    let order;
    try {
      order = await razorpay.orders.create({
        amount:   amountPaise,
        currency: "INR",
        receipt,
        notes: {
          societyId: societyId.toString(),
          plan,
          billingCycle,
          customPricing: isCustomPricing ? "true" : "false",
        },
      });
    } catch (err) {
      logger.error("[Payment] Razorpay order creation failed", {
        error: err?.error?.description || err.message,
        societyId,
        plan,
        billingCycle,
      });
      throw AppError.badRequest(
        err?.error?.description || "Could not create payment order. Please try again."
      );
    }

    const payment = await Payment.create({
      society:           societyId,
      initiatedBy:        adminUserId,
      plan,
      billingCycle,
      months,
      amount:             amountRupees,
      currency:           "INR",
      razorpayOrderId:    order.id,
      status:             "created",
      isCustomPricing,
    });

    logger.info("[Payment] Order created", {
      paymentId: payment._id.toString(),
      razorpayOrderId: order.id,
      societyId,
      plan,
      billingCycle,
      amountRupees,
      isCustomPricing,
    });

    return {
      paymentId:   payment._id,
      orderId:     order.id,
      amount:      amountPaise,   // paise — Razorpay Checkout SDK expects this
      amountRupees,
      currency:    "INR",
      keyId:       require("../config/razorpay").keyId,
      societyName: society.name,
      plan,
      billingCycle,
      isCustomPricing,
    };
  }

  /**
   * Verify the HMAC signature Razorpay Checkout returns to the client on
   * successful payment. Formula per Razorpay docs:
   *   expected = HMAC_SHA256(order_id + "|" + payment_id, key_secret)
   */
  _verifyCheckoutSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
    const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    return expected === razorpay_signature;
  }

  /**
   * Step 2 — Called by the frontend right after Razorpay Checkout's
   * `handler` callback fires with a successful payment.
   */
  async verifyAndApplyPayment(societyId, adminUserId, {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  }) {
    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!payment) throw AppError.notFound("Payment order not found.");

    if (payment.society.toString() !== societyId.toString()) {
      // Defensive — should never happen unless someone tampers with order id
      throw AppError.forbidden("This payment does not belong to your society.");
    }

    // Idempotent — if a webhook already marked this paid, just return success.
    if (payment.status === "paid") {
      return { alreadyProcessed: true, payment };
    }

    const isValid = this._verifyCheckoutSignature({
      razorpay_order_id, razorpay_payment_id, razorpay_signature,
    });

    if (!isValid) {
      payment.status        = "failed";
      payment.failureReason = "Signature verification failed on /verify call.";
      await payment.save();
      logger.warn("[Payment] Signature verification FAILED", {
        paymentId: payment._id.toString(),
        razorpay_order_id,
      });
      throw AppError.badRequest("Payment verification failed. If money was deducted, it will be auto-refunded within 5-7 days.");
    }

    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.status            = "paid";
    payment.paidAt            = new Date();
    await payment.save();

    await this._applySubscriptionExtension(payment, adminUserId);

    return { alreadyProcessed: false, payment };
  }

  /**
   * Extend/upgrade the society's Subscription after a confirmed payment.
   * Shared by both the /verify path and the webhook path.
   *
   * Rule: if the current subscription is still active and on the SAME plan,
   * extend from the existing endDate (renewal stacks). Otherwise (different
   * plan, or expired/free), start fresh from today (upgrade resets the clock).
   */
  async _applySubscriptionExtension(payment, performedByUserId) {
    const sub = await Subscription.findOne({ society: payment.society });
    if (!sub) {
      logger.error("[Payment] No Subscription document found for society — cannot apply payment", {
        societyId: payment.society.toString(),
        paymentId: payment._id.toString(),
      });
      return;
    }

    const now = new Date();
    const isRenewalSamePlan = sub.status === "active" && sub.plan === payment.plan && sub.endDate && sub.endDate > now;

    const newStartDate = isRenewalSamePlan ? sub.startDate : now;
    const baseDate     = isRenewalSamePlan ? sub.endDate : now;
    const newEndDate   = new Date(baseDate.getTime() + payment.months * 30 * 86_400_000);

    const fromPlan   = sub.plan;
    const fromStatus = sub.status;

    sub.plan         = payment.plan;
    sub.status       = "active";
    sub.startDate    = newStartDate;
    sub.endDate      = newEndDate;
    sub.priceMonthly = Math.round(payment.amount / payment.months);
    sub.history.push({
      action:      isRenewalSamePlan ? "renewed" : "upgraded",
      fromPlan,
      toPlan:      payment.plan,
      fromStatus,
      toStatus:    "active",
      note:        `Razorpay payment ${payment.razorpayPaymentId} — ${payment.billingCycle} (${payment.months}mo) — ₹${payment.amount}`,
      performedBy: null, // not a SuperAdmin action — paid by society admin
      performedAt: now,
    });
    await sub.save();

    // Re-enable paid modules implied by the new plan, mirroring the bundle
    // logic used elsewhere (superAdmin.service applyBundle / subscription.job
    // downgrade) — keeps enabledModules consistent with the plan tier.
    try {
      const { MODULE_BUNDLES } = require("../models/society.model");
      const bundleModules = MODULE_BUNDLES?.[payment.plan]?.modules;
      if (bundleModules?.length) {
        const enabledModulesUpdate = {};
        for (const key of bundleModules) enabledModulesUpdate[`enabledModules.${key}`] = true;
        await Society.findByIdAndUpdate(payment.society, { $set: enabledModulesUpdate });
      }
    } catch (err) {
      // Non-fatal — subscription itself is already saved; module sync can be
      // reconciled manually by SA if this ever throws.
      logger.warn("[Payment] Module bundle sync after payment failed (non-fatal)", { error: err.message });
    }

    logger.info("[Payment] Subscription extended", {
      societyId: payment.society.toString(),
      plan: payment.plan,
      newEndDate,
      renewal: isRenewalSamePlan,
    });

    // Notify the admin who pays (and any committee with billing permission)
    try {
      const society = await Society.findById(payment.society).select("admin name").populate({
        path: "admin", select: "fcmToken",
      });
      const tokens = [society?.admin?.fcmToken].filter(Boolean);
      if (tokens.length) {
        await notifySociety(tokens, {
          title:   "✅ Payment successful",
          body:    `${society.name} is now on the ${payment.plan} plan until ${newEndDate.toDateString()}.`,
          type:    "subscription_payment_success",
          payload: { plan: payment.plan, endDate: newEndDate.toISOString() },
          societyId: payment.society,
        });
      }
    } catch (err) {
      logger.warn("[Payment] Post-payment push notification failed (non-fatal)", { error: err.message });
    }
  }

  /**
   * Step 3 — Webhook handler. Mounted with raw body parsing (see app.js) so
   * we can verify the signature against the exact bytes Razorpay sent.
   *
   * Razorpay webhook signature formula:
   *   expected = HMAC_SHA256(rawRequestBody, webhook_secret)
   *   compare against header: x-razorpay-signature
   */
  verifyWebhookSignature(rawBody, signatureHeader) {
    if (!RAZORPAY_WEBHOOK_SECRET) {
      logger.warn("[Payment] RAZORPAY_WEBHOOK_SECRET not set — rejecting webhook for safety.");
      return false;
    }
    const expected = crypto
      .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");
    return expected === signatureHeader;
  }

  async handleWebhookEvent(parsedBody) {
    const event = parsedBody?.event;
    const entity = parsedBody?.payload?.payment?.entity || parsedBody?.payload?.order?.entity;

    if (!event || !entity) {
      logger.warn("[Payment] Webhook payload missing event/entity — ignored", { event });
      return;
    }

    const orderId = entity.order_id || entity.id; // payment entity has order_id; order entity has id
    if (!orderId) {
      logger.warn("[Payment] Webhook payload missing order id — ignored", { event });
      return;
    }

    const payment = await Payment.findOne({ razorpayOrderId: orderId });
    if (!payment) {
      logger.warn("[Payment] Webhook for unknown order id — ignored", { event, orderId });
      return;
    }

    payment.webhookEvents.push({ event, payload: parsedBody });

    if (event === "payment.captured" || event === "order.paid") {
      if (payment.status !== "paid") {
        payment.razorpayPaymentId = entity.id?.startsWith("pay_") ? entity.id : payment.razorpayPaymentId;
        payment.status            = "paid";
        payment.paidAt            = new Date();
        await payment.save();
        await this._applySubscriptionExtension(payment, payment.initiatedBy);
        logger.info("[Payment] Webhook applied subscription extension", { orderId, event });
      } else {
        await payment.save(); // still log the webhook event even if already processed
        logger.info("[Payment] Webhook received for already-paid order — idempotent skip", { orderId, event });
      }
    } else if (event === "payment.failed") {
      if (payment.status === "created" || payment.status === "attempted") {
        payment.status        = "failed";
        payment.failureReason = entity.error_description || "Payment failed at gateway.";
      }
      await payment.save();
      logger.info("[Payment] Webhook recorded payment failure", { orderId });
    } else {
      await payment.save(); // unrecognized event type — just log it for audit
      logger.info("[Payment] Webhook event recorded (no action taken)", { event, orderId });
    }
  }

  /** GET /payments/subscription/history — admin views their society's payment history */
  async getPaymentHistory(societyId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Payment.find({ society: societyId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payment.countDocuments({ society: societyId }),
    ]);
    return { items, total, page, limit };
  }

  /**
   * GET /payments/my-pricing
   * Shows the EFFECTIVE price for the logged-in society — their custom
   * negotiated rate if one is set, otherwise the standard plan rate. Lets
   * the upgrade screen display "Your price: ₹10/month" instead of the
   * generic price list, without the frontend needing to know about
   * customPricing at all.
   */
  async getMyEffectivePricing(societyId) {
    const sub = await Subscription.findOne({ society: societyId });
    const standard = getAllPricing();

    const hasCustom = Boolean(sub?.customPricing?.enabled && sub.customPricing.monthlyRupees != null);

    if (!hasCustom) {
      return { isCustomPricing: false, pricing: standard };
    }

    // Re-derive the cycle table (monthly/quarterly/halfyearly/annual) using
    // the custom monthly rate, same discount logic as standard pricing — but
    // only for the society's CURRENT plan, since that's what's relevant here.
    const { BILLING_CYCLES } = require("../config/pricing");
    const plan = ["basic", "premium"].includes(sub.plan) ? sub.plan : "basic";
    const table = {};
    for (const cycleKey of Object.keys(BILLING_CYCLES)) {
      const { amountRupees, months } = getPricing(plan, cycleKey, sub.customPricing.monthlyRupees);
      table[cycleKey] = {
        amountRupees,
        months,
        monthlyEquivalent: Math.round(amountRupees / months),
      };
    }

    return {
      isCustomPricing: true,
      plan,
      customMonthlyRupees: sub.customPricing.monthlyRupees,
      note: sub.customPricing.note,
      pricing: { [plan]: table },
    };
  }
}

module.exports = new PaymentService();
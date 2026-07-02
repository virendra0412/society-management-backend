/**
 * services/payment.service.js
 *
 * Core Razorpay billing logic. Entry points:
 *
 *  1. previewModulesPricing()         GET /payments/modules/preview
 *     Show prorated amount before checkout — no order created yet.
 *
 *  2. previewUpgrade()                GET /payments/upgrade/preview
 *     Show upgrade credit + charge before checkout.
 *
 *  3. createSubscriptionOrder()       POST /payments/subscription/create-order
 *     Buy/renew a plan. Applies custom rate + discount automatically.
 *
 *  4. createUpgradeOrder()            POST /payments/upgrade/create-order
 *     Mid-cycle plan upgrade. Credits unused old-plan days, charges delta.
 *
 *  5. createModulesOrder()            POST /payments/modules/create-order
 *     À la carte module purchase. Prorates to subscription's renewal date.
 *
 *  6. verifyAndApplyPayment()         POST /payments/subscription/verify
 *     Verify HMAC → apply effect. Serves all three purchase types above.
 *
 *  7. handleWebhookEvent()            POST /payments/webhook
 *     Safety net: same logic, server-to-server.
 *
 *  8. getMyEffectivePricing()         GET /payments/my-pricing
 *     Effective plan + per-module prices for the logged-in society.
 *
 *  9. getPaymentHistory()             GET /payments/subscription/history
 */
const crypto = require("crypto");

const { getRazorpayClient, keyId } = require("../config/razorpay");
const {
  getPricing,
  getAllPricing,
  getModulesPricing,
  computeProratedAmount,
  computeUpgradeCredit,
  computeDiscountedAmount,
  BILLING_CYCLES,
} = require("../config/pricing");
const { Payment }          = require("../models/payment.model");
const { Subscription }     = require("../models/subscription.model");
const Society              = require("../models/society.model").Society;
const { PAID_MODULES, DEFAULT_MODULE_PRICES, MODULE_BUNDLES } = require("../models/society.model");
const AppError             = require("../utils/AppError");
const logger               = require("../utils/logger");
const { notifySociety }    = require("../utils/notification");

const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";

// ── Helpers ───────────────────────────────────────────────────────────────────

function _getCustomMonthlyRupees(sub) {
  return sub?.customPricing?.enabled && sub.customPricing.monthlyRupees != null
    ? sub.customPricing.monthlyRupees
    : null;
}

function _getActiveDiscount(sub) {
  const d = sub?.discount;
  if (!d || (!d.pct && !d.flatRupees)) return null;
  if (d.validUntil && new Date(d.validUntil) < new Date()) return null;
  return d;
}

// Compute days left in current cycle and total days — used for proration + credit
function _cycleProgress(sub) {
  const now        = Date.now();
  const end        = new Date(sub.endDate).getTime();
  const start      = new Date(sub.startDate).getTime();
  const totalDays  = Math.ceil((end - start) / 86_400_000);
  const daysLeft   = Math.max(1, Math.ceil((end - now) / 86_400_000));
  return { totalDays, daysLeft };
}

// Build a Razorpay receipt string (≤40 chars)
function _receipt(prefix, societyId) {
  return `${prefix}_${societyId.toString().slice(-8)}_${Date.now().toString().slice(-8)}`;
}

// ── 1. Preview module proration ───────────────────────────────────────────────

class PaymentService {

  async previewModulesPricing(societyId, moduleKeys) {
    const [society, sub] = await Promise.all([
      Society.findById(societyId, "name enabledModules moduleCharges").lean(),
      Subscription.findOne({ society: societyId }).lean(),
    ]);
    if (!society) throw AppError.notFound("Society not found.");

    const purchasable = [...new Set(moduleKeys)].filter(
      (k) => PAID_MODULES.includes(k) && !society.enabledModules?.[k]
    );
    if (purchasable.length === 0) throw AppError.badRequest("All selected modules are already enabled.");

    const isActiveSub = sub?.status === "active" && sub?.endDate && new Date(sub.endDate) > new Date();
    const prorateOptions = isActiveSub
      ? { endDate: sub.endDate, daysInCycle: BILLING_CYCLES[sub.billingCycle || "monthly"]?.months * 30 || 30 }
      : null;

    const { amountRupees, breakdown, isProrated } = getModulesPricing(
      purchasable, society.moduleCharges, prorateOptions
    );

    return {
      modules:    purchasable,
      breakdown,
      amountRupees,
      isProrated,
      renewalDate: sub?.endDate || null,
      isCustomPricing: breakdown.some((b) => b.isCustomPricing),
    };
  }

  // ── 2. Preview upgrade credit ───────────────────────────────────────────────

  async previewUpgrade(societyId, { plan: newPlan, billingCycle }) {
    const [society, sub] = await Promise.all([
      Society.findById(societyId, "name").lean(),
      Subscription.findOne({ society: societyId }).lean(),
    ]);
    if (!society) throw AppError.notFound("Society not found.");
    if (!sub || sub.status !== "active") throw AppError.badRequest("No active subscription to upgrade from.");

    const customRate  = _getCustomMonthlyRupees(sub);
    const discount    = _getActiveDiscount(sub);
    const { totalDays, daysLeft } = _cycleProgress(sub);

    // New plan prorated cost
    const { PAYABLE_PLANS } = require("../models/subscription.model");
    const { computeProratedAmount: prorate } = require("../config/pricing");
    const { BASE_MONTHLY_RUPEES } = require("../config/pricing");
    const newMonthly = BASE_MONTHLY_RUPEES[newPlan] ?? 0;
    const { proratedRupees: newPlanProrated } = prorate(newMonthly, sub.endDate, totalDays);

    // Credit from current plan
    const amountPaidForCycle = sub.priceMonthly * (totalDays / 30);
    const { credit, chargeRupees: baseCharge } = computeUpgradeCredit(
      amountPaidForCycle, totalDays, daysLeft, newPlanProrated
    );

    const chargeRupees = computeDiscountedAmount(baseCharge, discount);

    return {
      fromPlan:        sub.plan,
      toPlan:          newPlan,
      daysLeft,
      totalDays,
      newPlanProrated,
      creditRupees:    credit,
      discountRupees:  baseCharge - chargeRupees,
      chargeRupees,
      renewalDate:     sub.endDate,
      couponCode:      discount?.code || null,
    };
  }

  // ── 3. Create subscription order (plan purchase / renewal) ──────────────────

  async createSubscriptionOrder(societyId, adminUserId, { plan, billingCycle }) {
    const [society, sub] = await Promise.all([
      Society.findById(societyId, "name").lean(),
      Subscription.findOne({ society: societyId }).lean(),
    ]);
    if (!society) throw AppError.notFound("Society not found.");

    const customRate = _getCustomMonthlyRupees(sub);
    const discount   = _getActiveDiscount(sub);

    const { amountRupees: baseAmount, amountPaise: _, months, isCustomPricing } =
      getPricing(plan, billingCycle, customRate);

    const discountedAmount = computeDiscountedAmount(baseAmount, discount);
    const discountApplied  = baseAmount - discountedAmount;
    const amountPaise      = discountedAmount * 100;

    const razorpay = getRazorpayClient();
    let order;
    try {
      order = await razorpay.orders.create({
        amount:   amountPaise,
        currency: "INR",
        receipt:  _receipt("sub", societyId),
        notes: {
          societyId:     societyId.toString(),
          plan,
          billingCycle,
          customPricing: isCustomPricing ? "true" : "false",
          coupon:        discount?.code || "",
        },
      });
    } catch (err) {
      logger.error("[Payment] Razorpay order creation failed", { error: err?.error?.description || err.message });
      throw AppError.badRequest(err?.error?.description || "Could not create payment order.");
    }

    const payment = await Payment.create({
      society:         societyId,
      initiatedBy:     adminUserId,
      purchaseType:    "plan",
      plan,
      billingCycle,
      months,
      amount:          discountedAmount,
      fullAmount:      baseAmount,
      discountApplied,
      couponCode:      discount?.code || null,
      currency:        "INR",
      razorpayOrderId: order.id,
      status:          "created",
      isCustomPricing,
    });

    logger.info("[Payment] Plan order created", {
      paymentId: payment._id, orderId: order.id, plan, billingCycle, discountedAmount,
    });

    return {
      paymentId:       payment._id,
      orderId:         order.id,
      amount:          amountPaise,
      amountRupees:    discountedAmount,
      fullAmountRupees: baseAmount,
      discountApplied,
      currency:        "INR",
      keyId,
      societyName:     society.name,
      plan,
      billingCycle,
      isCustomPricing,
      couponCode:      discount?.code || null,
    };
  }

  // ── 4. Create upgrade order (mid-cycle plan upgrade with credit) ────────────

  async createUpgradeOrder(societyId, adminUserId, { plan: newPlan, billingCycle }) {
    const [society, sub] = await Promise.all([
      Society.findById(societyId, "name").lean(),
      Subscription.findOne({ society: societyId }).lean(),
    ]);
    if (!society) throw AppError.notFound("Society not found.");
    if (!sub || sub.status !== "active") throw AppError.badRequest("No active subscription to upgrade from.");
    if (sub.plan === newPlan) throw AppError.badRequest("You are already on this plan.");

    const discount    = _getActiveDiscount(sub);
    const { totalDays, daysLeft } = _cycleProgress(sub);

    const { BASE_MONTHLY_RUPEES, computeProratedAmount: prorate } = require("../config/pricing");
    const newMonthly = BASE_MONTHLY_RUPEES[newPlan] ?? 0;
    const { proratedRupees: newPlanProrated } = prorate(newMonthly, sub.endDate, totalDays);

    const amountPaidForCycle = sub.priceMonthly * (totalDays / 30);
    const { credit, chargeRupees: baseCharge } = computeUpgradeCredit(
      amountPaidForCycle, totalDays, daysLeft, newPlanProrated
    );

    const chargeRupees = computeDiscountedAmount(baseCharge, discount);
    const discountApplied = baseCharge - chargeRupees;
    const amountPaise = chargeRupees * 100;

    const razorpay = getRazorpayClient();
    let order;
    try {
      order = await razorpay.orders.create({
        amount:   amountPaise,
        currency: "INR",
        receipt:  _receipt("upg", societyId),
        notes: {
          societyId: societyId.toString(),
          fromPlan:  sub.plan,
          toPlan:    newPlan,
          credit:    String(credit),
        },
      });
    } catch (err) {
      logger.error("[Payment] Razorpay upgrade order failed", { error: err?.error?.description });
      throw AppError.badRequest(err?.error?.description || "Could not create upgrade order.");
    }

    const payment = await Payment.create({
      society:         societyId,
      initiatedBy:     adminUserId,
      purchaseType:    "upgrade",
      plan:            newPlan,
      billingCycle,
      months:          BILLING_CYCLES[billingCycle].months,
      previousPlan:    sub.plan,
      creditApplied:   credit,
      amount:          chargeRupees,
      fullAmount:      newPlanProrated,
      discountApplied,
      couponCode:      discount?.code || null,
      isProrated:      true,
      proratedDays:    daysLeft,
      currency:        "INR",
      razorpayOrderId: order.id,
      status:          "created",
    });

    logger.info("[Payment] Upgrade order created", {
      paymentId: payment._id, fromPlan: sub.plan, toPlan: newPlan, credit, chargeRupees,
    });

    return {
      paymentId:       payment._id,
      orderId:         order.id,
      amount:          amountPaise,
      amountRupees:    chargeRupees,
      creditApplied:   credit,
      discountApplied,
      currency:        "INR",
      keyId,
      societyName:     society.name,
      fromPlan:        sub.plan,
      toPlan:          newPlan,
      daysLeft,
    };
  }

  // ── 5. Create modules order (à la carte, prorated) ──────────────────────────

  async createModulesOrder(societyId, adminUserId, moduleKeys, { forceFullMonth = false } = {}) {
    const [society, sub] = await Promise.all([
      Society.findById(societyId, "name enabledModules moduleCharges").lean(),
      Subscription.findOne({ society: societyId }).lean(),
    ]);
    if (!society) throw AppError.notFound("Society not found.");

    const purchasable = [...new Set(moduleKeys)].filter(
      (k) => PAID_MODULES.includes(k) && !society.enabledModules?.[k]
    );
    if (purchasable.length === 0) {
      throw AppError.badRequest("All selected modules are already enabled, or no valid modules were provided.");
    }

    const isActiveSub = !forceFullMonth && sub?.status === "active" &&
      sub?.endDate && new Date(sub.endDate) > new Date();

    const prorateOptions = isActiveSub
      ? { endDate: sub.endDate, daysInCycle: BILLING_CYCLES[sub.billingCycle || "monthly"]?.months * 30 || 30 }
      : null;

    const { amountRupees, amountPaise, breakdown, isProrated } = getModulesPricing(
      purchasable, society.moduleCharges, prorateOptions
    );

    const isCustomPricing = breakdown.some((b) => b.isCustomPricing);
    const daysLeft = prorateOptions
      ? Math.max(1, Math.ceil((new Date(sub.endDate) - Date.now()) / 86_400_000))
      : null;

    const razorpay = getRazorpayClient();
    let order;
    try {
      order = await razorpay.orders.create({
        amount:   amountPaise,
        currency: "INR",
        receipt:  _receipt("mod", societyId),
        notes: {
          societyId:      societyId.toString(),
          modules:        purchasable.join(","),
          isProrated:     isProrated ? "true" : "false",
          isCustomPricing: isCustomPricing ? "true" : "false",
        },
      });
    } catch (err) {
      logger.error("[Payment] Razorpay modules order failed", { error: err?.error?.description });
      throw AppError.badRequest(err?.error?.description || "Could not create payment order.");
    }

    const payment = await Payment.create({
      society:         societyId,
      initiatedBy:     adminUserId,
      purchaseType:    "modules",
      modules:         purchasable,
      amount:          amountRupees,
      currency:        "INR",
      isCustomPricing,
      isProrated,
      proratedDays:    daysLeft,
      razorpayOrderId: order.id,
      status:          "created",
    });

    logger.info("[Payment] Modules order created", {
      paymentId: payment._id, modules: purchasable, amountRupees, isProrated,
    });

    return {
      paymentId:    payment._id,
      orderId:      order.id,
      amount:       amountPaise,
      amountRupees,
      currency:     "INR",
      keyId,
      societyName:  society.name,
      modules:      purchasable,
      breakdown,
      isProrated,
      proratedDays: daysLeft,
      renewalDate:  sub?.endDate || null,
      isCustomPricing,
    };
  }

  // ── 6. Verify + apply ────────────────────────────────────────────────────────

  _verifyCheckoutSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    return expected === razorpay_signature;
  }

  async verifyAndApplyPayment(societyId, adminUserId, {
    razorpay_order_id, razorpay_payment_id, razorpay_signature,
  }) {
    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!payment) throw AppError.notFound("Payment order not found.");
    if (payment.society.toString() !== societyId.toString()) throw AppError.forbidden("Payment mismatch.");
    if (payment.status === "paid") return { alreadyProcessed: true, payment };

    const isValid = this._verifyCheckoutSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
    if (!isValid) {
      payment.status        = "failed";
      payment.failureReason = "Signature verification failed on /verify.";
      await payment.save();
      logger.warn("[Payment] Signature FAILED", { razorpay_order_id });
      throw AppError.badRequest("Verification failed. If money was deducted it will be refunded in 5-7 days.");
    }

    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.status            = "paid";
    payment.paidAt            = new Date();
    await payment.save();

    await this._applyPaymentEffect(payment, adminUserId);
    return { alreadyProcessed: false, payment };
  }

  // ── 7. Dispatch effect ────────────────────────────────────────────────────────

  async _applyPaymentEffect(payment, performedByUserId) {
    if (payment.purchaseType === "modules") return this._applyModuleUnlock(payment);
    return this._applySubscriptionExtension(payment, performedByUserId);
  }

  async _applyModuleUnlock(payment) {
    const update = {};
    for (const key of payment.modules) update[`enabledModules.${key}`] = true;

    const society = await Society.findByIdAndUpdate(payment.society, { $set: update }, { new: true })
      .select("name admin").populate({ path: "admin", select: "fcmToken" });
    if (!society) return;

    logger.info("[Payment] Modules unlocked", { modules: payment.modules, societyId: payment.society });

    try {
      const tokens = [society?.admin?.fcmToken].filter(Boolean);
      if (tokens.length) {
        await notifySociety(tokens, {
          title: "✅ Payment successful",
          body:  `${payment.modules.join(", ")} ${payment.modules.length > 1 ? "are" : "is"} now active.`,
          type: "module_payment_success",
          payload: { modules: payment.modules },
          societyId: payment.society,
        });
      }
    } catch (err) {
      logger.warn("[Payment] Post-module-unlock push failed (non-fatal)", { error: err.message });
    }
  }

  async _applySubscriptionExtension(payment, performedByUserId) {
    const sub = await Subscription.findOne({ society: payment.society });
    if (!sub) {
      logger.error("[Payment] No Subscription found", { societyId: payment.society });
      return;
    }

    const now    = new Date();
    const isUpgrade = payment.purchaseType === "upgrade";
    const isRenewal = !isUpgrade && sub.status === "active" &&
      sub.plan === payment.plan && sub.endDate && sub.endDate > now;

    let newStartDate, newEndDate;
    if (isUpgrade) {
      // Keep the same renewal date, just change the plan
      newStartDate = sub.startDate;
      newEndDate   = sub.endDate;
    } else if (isRenewal) {
      newStartDate = sub.startDate;
      newEndDate   = new Date(sub.endDate.getTime() + payment.months * 30 * 86_400_000);
    } else {
      newStartDate = now;
      newEndDate   = new Date(now.getTime() + payment.months * 30 * 86_400_000);
    }

    // On a new plan purchase, set the billing anchor day
    if (!isRenewal && !isUpgrade) {
      sub.billingAnchorDay = Math.min(now.getDate(), 28);
    }

    // Clear any pending downgrade if they're now upgrading
    if (isUpgrade) {
      sub.pendingPlan   = null;
      sub.pendingPlanAt = null;
    }

    const fromPlan   = sub.plan;
    const fromStatus = sub.status;
    sub.plan         = payment.plan;
    sub.status       = "active";
    sub.startDate    = newStartDate;
    sub.endDate      = newEndDate;
    sub.priceMonthly = Math.round(payment.amount / (payment.months || 1));
    sub.history.push({
      action:      isUpgrade ? "upgraded" : (isRenewal ? "renewed" : "plan_changed"),
      fromPlan,
      toPlan:      payment.plan,
      fromStatus,
      toStatus:    "active",
      note:        isUpgrade
        ? `Upgraded from ${fromPlan} to ${payment.plan}. Credit: ₹${payment.creditApplied}, charged: ₹${payment.amount}. Razorpay: ${payment.razorpayPaymentId}`
        : `Razorpay ${payment.razorpayPaymentId} — ${payment.billingCycle} (${payment.months}mo) — ₹${payment.amount}`,
      performedAt: now,
    });
    await sub.save();

    // Re-enable plan bundle modules
    try {
      const bundleModules = MODULE_BUNDLES?.[payment.plan]?.modules;
      if (bundleModules?.length) {
        const enabledUpdate = {};
        for (const key of bundleModules) enabledUpdate[`enabledModules.${key}`] = true;
        await Society.findByIdAndUpdate(payment.society, { $set: enabledUpdate });
      }
    } catch (err) {
      logger.warn("[Payment] Module bundle sync failed (non-fatal)", { error: err.message });
    }

    logger.info("[Payment] Subscription extended", {
      societyId: payment.society, plan: payment.plan, newEndDate,
    });

    try {
      const society = await Society.findById(payment.society).select("admin name")
        .populate({ path: "admin", select: "fcmToken" });
      const tokens = [society?.admin?.fcmToken].filter(Boolean);
      if (tokens.length) {
        await notifySociety(tokens, {
          title: "✅ Payment successful",
          body:  `${society.name} is now on the ${payment.plan} plan until ${newEndDate.toDateString()}.`,
          type: "subscription_payment_success",
          payload: { plan: payment.plan, endDate: newEndDate.toISOString() },
          societyId: payment.society,
        });
      }
    } catch (err) {
      logger.warn("[Payment] Post-payment push failed (non-fatal)", { error: err.message });
    }
  }

  // ── 8. Webhook ────────────────────────────────────────────────────────────────

  verifyWebhookSignature(rawBody, signatureHeader) {
    if (!RAZORPAY_WEBHOOK_SECRET) {
      logger.warn("[Payment] RAZORPAY_WEBHOOK_SECRET not set — rejecting webhook.");
      return false;
    }
    const expected = crypto
      .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");
    return expected === signatureHeader;
  }

  async handleWebhookEvent(parsedBody) {
    const event  = parsedBody?.event;
    const entity = parsedBody?.payload?.payment?.entity || parsedBody?.payload?.order?.entity;
    if (!event || !entity) { logger.warn("[Payment] Webhook missing event/entity"); return; }

    const orderId = entity.order_id || entity.id;
    if (!orderId) { logger.warn("[Payment] Webhook missing order id"); return; }

    const payment = await Payment.findOne({ razorpayOrderId: orderId });
    if (!payment) { logger.warn("[Payment] Webhook unknown order", { orderId }); return; }

    payment.webhookEvents.push({ event, payload: parsedBody });

    if (event === "payment.captured" || event === "order.paid") {
      if (payment.status !== "paid") {
        payment.razorpayPaymentId = entity.id?.startsWith("pay_") ? entity.id : payment.razorpayPaymentId;
        payment.status = "paid";
        payment.paidAt = new Date();
        await payment.save();
        await this._applyPaymentEffect(payment, payment.initiatedBy);
        logger.info("[Payment] Webhook applied effect", { orderId, event });
      } else {
        await payment.save();
        logger.info("[Payment] Webhook for already-paid order — skip", { orderId });
      }
    } else if (event === "payment.failed") {
      if (payment.status === "created" || payment.status === "attempted") {
        payment.status        = "failed";
        payment.failureReason = entity.error_description || "Payment failed at gateway.";
      }
      await payment.save();
    } else {
      await payment.save();
    }
  }

  // ── 9. Payment history ────────────────────────────────────────────────────────

  async getPaymentHistory(societyId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Payment.find({ society: societyId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Payment.countDocuments({ society: societyId }),
    ]);
    return { items, total, page, limit };
  }

  // ── 10. Effective pricing for logged-in society ────────────────────────────

  async getMyEffectivePricing(societyId) {
    const [sub, society] = await Promise.all([
      Subscription.findOne({ society: societyId }).lean(),
      Society.findById(societyId, "enabledModules moduleCharges").lean(),
    ]);

    const standard = getAllPricing();

    // Build per-module effective prices (for the à la carte checkbox list)
    const modulePricing = {};
    for (const key of PAID_MODULES) {
      const enabled = society?.enabledModules?.[key] === true;
      const custom  = society?.moduleCharges?.[key];
      const def     = DEFAULT_MODULE_PRICES[key] ?? 0;
      modulePricing[key] = {
        enabled,
        amountRupees:    custom != null ? custom : def,
        isCustomPricing: custom != null && custom !== def,
      };
    }

    const hasCustom    = Boolean(sub?.customPricing?.enabled && sub.customPricing.monthlyRupees != null);
    const activeDiscount = _getActiveDiscount(sub);

    if (!hasCustom) {
      return {
        isCustomPricing: false,
        pricing:         standard,
        modulePricing,
        discount:        activeDiscount ? {
          code: activeDiscount.code,
          pct:  activeDiscount.pct,
          flat: activeDiscount.flatRupees,
        } : null,
        billingAnchorDay: sub?.billingAnchorDay || null,
        renewalDate:      sub?.endDate || null,
        pendingPlan:      sub?.pendingPlan || null,
        pendingPlanAt:    sub?.pendingPlanAt || null,
      };
    }

    // Custom monthly rate — derive cycle table for their plan
    const plan = ["starter", "professional", "enterprise"].includes(sub.plan) ? sub.plan : "starter";
    const table = {};
    for (const cycleKey of Object.keys(BILLING_CYCLES)) {
      const { amountRupees, months } = getPricing(plan, cycleKey, sub.customPricing.monthlyRupees);
      const discounted = computeDiscountedAmount(amountRupees, activeDiscount);
      table[cycleKey] = {
        amountRupees:      discounted,
        fullAmountRupees:  amountRupees,
        discountApplied:   amountRupees - discounted,
        months,
        monthlyEquivalent: Math.round(discounted / months),
      };
    }

    return {
      isCustomPricing:      true,
      plan,
      customMonthlyRupees:  sub.customPricing.monthlyRupees,
      note:                 sub.customPricing.note,
      pricing:              { [plan]: table },
      modulePricing,
      discount:             activeDiscount ? {
        code: activeDiscount.code, pct: activeDiscount.pct, flat: activeDiscount.flatRupees,
      } : null,
      billingAnchorDay:     sub?.billingAnchorDay || null,
      renewalDate:          sub?.endDate || null,
      pendingPlan:          sub?.pendingPlan || null,
      pendingPlanAt:        sub?.pendingPlanAt || null,
    };
  }
}

module.exports = new PaymentService();
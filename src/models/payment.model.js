/**
 * models/payment.model.js
 *
 * One document per Razorpay order created. This is the audit trail for
 * every subscription payment attempt — created, paid, failed, or abandoned.
 *
 * Lifecycle:
 *   created   → order created, checkout not yet opened/completed by user
 *   attempted → Razorpay sent a webhook saying payment was attempted (optional)
 *   paid      → signature verified (via /verify or webhook) and subscription updated
 *   failed    → payment.failed webhook received, or verify signature mismatch
 *
 * Idempotency: both the /verify endpoint and the webhook handler can mark a
 * Payment as "paid" — whichever fires first wins. Both paths check
 * `status === "paid"` before re-applying the subscription update, so a
 * duplicate webhook delivery (Razorpay retries webhooks) never double-extends
 * a subscription.
 */
const mongoose = require("mongoose");

const PAYMENT_STATUSES = Object.freeze(["created", "attempted", "paid", "failed"]);
const PAYABLE_PLANS    = Object.freeze(["basic", "premium"]);
const BILLING_CYCLES   = Object.freeze(["monthly", "quarterly", "halfyearly", "annual"]);
// "plan"    — buying/renewing a fixed basic/premium plan (existing flow)
// "modules" — buying a custom hand-picked set of paid modules directly,
//             with no plan attached. See payment.service.js createModulesOrder().
const PURCHASE_TYPES   = Object.freeze(["plan", "modules"]);

const paymentSchema = new mongoose.Schema(
  {
    society: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Society",
      required: true,
      index:    true,
    },
    // The society-admin user who initiated the payment (for audit/notification)
    initiatedBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    // ── What's being purchased ───────────────────────────────────────────────
    purchaseType: { type: String, enum: PURCHASE_TYPES, default: "plan", required: true },

    // Plan-purchase fields — required when purchaseType === "plan"
    plan:         { type: String, enum: PAYABLE_PLANS,  required: function () { return this.purchaseType === "plan"; } },
    billingCycle: { type: String, enum: BILLING_CYCLES, required: function () { return this.purchaseType === "plan"; } },
    months:       { type: Number, required: function () { return this.purchaseType === "plan"; } }, // duration this payment extends the subscription by

    // Module-purchase fields — required when purchaseType === "modules"
    // Buying modules directly enables them immediately on payment, with no
    // expiry — they're a one-time unlock, not a recurring plan component.
    // (If the society later moves to a plan that already includes one of
    // these modules, that's fine — enabledModules is just a boolean per key.)
    modules: {
      type:    [String],
      default: undefined,
      required: function () { return this.purchaseType === "modules"; },
    },

    // ── Money ─────────────────────────────────────────────────────────────────
    amount:   { type: Number, required: true }, // rupees (not paise) — for display/reporting
    currency: { type: String, default: "INR" },
    // True when this order was priced using the society's negotiated rate
    // (Subscription.customPricing for plans, or Society.moduleCharges for
    // individual modules) rather than the standard/default rate. Kept on the
    // payment record (not just the live config) so historical reports show
    // exactly what rate was charged at the time, even if rates change later.
    isCustomPricing: { type: Boolean, default: false },

    // ── Razorpay identifiers ─────────────────────────────────────────────────
    razorpayOrderId:   { type: String, required: true, unique: true, index: true },
    razorpayPaymentId: { type: String, default: null, index: true },
    razorpaySignature: { type: String, default: null },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    PAYMENT_STATUSES,
      default: "created",
      index:   true,
    },
    failureReason: { type: String, default: null },

    // Raw webhook payload kept for debugging/dispute resolution — Razorpay
    // support will ask for this if a payment is ever contested.
    webhookEvents: [
      {
        event:      { type: String },
        receivedAt: { type: Date, default: () => new Date() },
        payload:    { type: mongoose.Schema.Types.Mixed },
      },
    ],

    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ society: 1, createdAt: -1 });

const Payment = mongoose.model("Payment", paymentSchema);
module.exports = { Payment, PAYMENT_STATUSES, PAYABLE_PLANS, BILLING_CYCLES, PURCHASE_TYPES };
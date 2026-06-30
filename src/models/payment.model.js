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
    plan:         { type: String, enum: PAYABLE_PLANS,  required: true },
    billingCycle: { type: String, enum: BILLING_CYCLES, required: true },
    months:       { type: Number, required: true }, // duration this payment extends the subscription by

    // ── Money ─────────────────────────────────────────────────────────────────
    amount:   { type: Number, required: true }, // rupees (not paise) — for display/reporting
    currency: { type: String, default: "INR" },
    // True when this order was priced using the society's Subscription.customPricing
    // override rather than config/pricing.js's standard plan rate. Kept on the
    // payment record (not just the subscription) so historical reports can show
    // exactly what rate was charged at the time, even if customPricing is later changed.
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
module.exports = { Payment, PAYMENT_STATUSES, PAYABLE_PLANS, BILLING_CYCLES };
/**
 * models/payment.model.js
 *
 * One document per Razorpay order created.
 *
 * purchaseType:
 *   "plan"    — buying/renewing a fixed plan (starter/professional/enterprise)
 *   "modules" — buying a hand-picked set of paid modules directly (à la carte)
 *   "upgrade" — mid-cycle plan upgrade with credit applied (chargesCredit recorded)
 *
 * Idempotent: both /verify and the webhook can mark a Payment as "paid" —
 * whichever fires first wins. The second path checks status === "paid" and skips.
 */
const mongoose = require("mongoose");

const PAYMENT_STATUSES = Object.freeze(["created", "attempted", "paid", "failed"]);
const PAYABLE_PLANS    = Object.freeze(["starter", "professional", "enterprise"]);
const BILLING_CYCLES   = Object.freeze(["monthly", "quarterly", "halfyearly", "annual"]);
const PURCHASE_TYPES   = Object.freeze(["plan", "modules", "upgrade"]);

const paymentSchema = new mongoose.Schema(
  {
    society:     { type: mongoose.Schema.Types.ObjectId, ref: "Society", required: true, index: true },
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User",   required: true },

    // ── What's being purchased ────────────────────────────────────────────────
    purchaseType: { type: String, enum: PURCHASE_TYPES, default: "plan", required: true },

    // Plan / upgrade fields
    plan:         { type: String, enum: PAYABLE_PLANS,  default: null },
    billingCycle: { type: String, enum: BILLING_CYCLES, default: null },
    months:       { type: Number, default: null },

    // Upgrade-specific: credit applied from unused portion of previous plan
    previousPlan:    { type: String, default: null },
    creditApplied:   { type: Number, default: 0 },  // rupees credited from old plan

    // Module-purchase fields
    modules: { type: [String], default: undefined },

    // ── Proration info (stored for receipt display) ───────────────────────────
    isProrated:   { type: Boolean, default: false },
    proratedDays: { type: Number, default: null },   // daysLeft at time of purchase

    // ── Money ─────────────────────────────────────────────────────────────────
    amount:          { type: Number, required: true },  // rupees charged (after discount + credit)
    fullAmount:      { type: Number, default: null },   // rupees before discount/credit (for display)
    discountApplied: { type: Number, default: 0 },      // rupees saved by discount/coupon
    currency:        { type: String, default: "INR" },
    isCustomPricing: { type: Boolean, default: false },

    // ── Coupon used (snapshot at purchase time) ───────────────────────────────
    couponCode:    { type: String, default: null },

    // ── Razorpay identifiers ─────────────────────────────────────────────────
    razorpayOrderId:   { type: String, required: true, unique: true, index: true },
    razorpayPaymentId: { type: String, default: null, index: true },
    razorpaySignature: { type: String, default: null },

    // ── Status ────────────────────────────────────────────────────────────────
    status:        { type: String, enum: PAYMENT_STATUSES, default: "created", index: true },
    failureReason: { type: String, default: null },

    // Raw webhook payloads for debugging / dispute resolution
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
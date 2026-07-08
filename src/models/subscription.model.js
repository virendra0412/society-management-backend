/**
 * Subscription Model
 *
 * One subscription record per society (one-to-one).
 *
 * Plans:
 *   trial       — 30 days free, all features. Auto-downgrades to "free".
 *   free        — Permanent, core features, max 25 residents.
 *   starter     — ₹599/month, max 100 residents.       (was: basic)
 *   professional— ₹999/month, max 500 residents.       (was: premium)
 *   enterprise  — ₹1799/month, unlimited residents.    (NEW)
 *
 * Billing rules (per requirements doc):
 *   - ONE renewal date per society — everything renews together.
 *   - billingAnchorDay: 1-28, the day-of-month all charges fall on.
 *   - Proration on mid-cycle module purchase: charge × daysLeft/daysInCycle.
 *   - Scheduled downgrade: pendingPlan set now, applied at next renewal.
 *   - Grace period: society keeps access N days after expiry before lockout.
 *   - Coupon/discount: flat or percent off, with optional expiry date.
 */
const mongoose = require("mongoose");

const PLANS        = Object.freeze(["trial", "free", "starter", "professional", "enterprise"]);
const SUB_STATUSES = Object.freeze(["active", "expired", "suspended", "cancelled"]);
const PLAN_LIMITS  = Object.freeze({
  trial:        { maxResidents: 50,   priceMonthly: 0,    endDate: true  },
  free:         { maxResidents: 25,   priceMonthly: 0,    endDate: false },
  starter:      { maxResidents: 100,  priceMonthly: 599,  endDate: true  },
  professional: { maxResidents: 500,  priceMonthly: 999,  endDate: true  },
  enterprise:   { maxResidents: null, priceMonthly: 1799, endDate: true  },
});

// Plans the Razorpay checkout flow accepts — free/trial are never paid
const PAYABLE_PLANS = Object.freeze(["starter", "professional", "enterprise"]);

const TRIAL_DAYS = 30;

const historyEntrySchema = new mongoose.Schema(
  {
    action:      { type: String, trim: true },
    fromPlan:    { type: String, default: null },
    toPlan:      { type: String, default: null },
    fromStatus:  { type: String, default: null },
    toStatus:    { type: String, default: null },
    note:        { type: String, trim: true, default: null },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin", default: null },
    performedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const subscriptionSchema = new mongoose.Schema(
  {
    society: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Society",
      required: true,
      unique:   true,
      index:    true,
    },
    plan: {
      type:    String,
      enum:    { values: PLANS, message: "Invalid plan: {VALUE}" },
      default: "trial",
    },
    status: {
      type:    String,
      enum:    { values: SUB_STATUSES, message: "Invalid status" },
      default: "active",
      index:   true,
    },
    startDate: { type: Date, required: true },
    endDate:   { type: Date, required: true, index: true },

    // ── Single billing anchor ─────────────────────────────────────────────────
    // Day-of-month (1–28) on which all charges renew. Set on first payment,
    // never changes unless the SA explicitly resets it. Module purchases
    // prorate to the NEXT occurrence of this anchor date so everything
    // always expires together.
    billingAnchorDay: { type: Number, min: 1, max: 28, default: 1 },

    // ── Scheduled downgrade ───────────────────────────────────────────────────
    // When a society downgrades (e.g. enterprise → starter), we never cut
    // access immediately. Instead we set pendingPlan here and subscription.job
    // applies it at the next renewal. The UI shows "Starter begins 1 Aug".
    pendingPlan:   { type: String, enum: [...PLANS, null], default: null },
    pendingPlanAt: { type: Date, default: null },   // when the switch will happen

    // ── Grace period ─────────────────────────────────────────────────────────
    // After endDate passes, society keeps access for gracePeriodDays before
    // modules are locked. Default 7, SA can override per-society.
    gracePeriodDays: { type: Number, min: 0, max: 30, default: 7 },

    // ── Billing record ───────────────────────────────────────────────────────
    priceMonthly: { type: Number, default: 0 },   // last-paid monthly rate (record only)
    autoRenew:    { type: Boolean, default: false },

    // ── Coupon / discount ────────────────────────────────────────────────────
    // SA sets a discount for a society. Applied at order-creation time by
    // payment.service.js. Either flatRupees OR pct (not both).
    discount: {
      code:        { type: String, trim: true, uppercase: true, default: null },
      pct:         { type: Number, min: 0, max: 100, default: null },   // e.g. 20 = 20% off
      flatRupees:  { type: Number, min: 0, default: null },             // e.g. 100 = ₹100 off
      validUntil:  { type: Date, default: null },   // null = no expiry
      note:        { type: String, trim: true, maxlength: 200, default: null },
      setBy:       { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin", default: null },
      setAt:       { type: Date, default: null },
    },

    // ── Custom / negotiated plan pricing ────────────────────────────────────
    // SA overrides the standard plan rate for one society.
    // Applies on their next Razorpay order via payment.service.js.
    customPricing: {
      enabled:       { type: Boolean, default: false },
      monthlyRupees: { type: Number, default: null },
      note:          { type: String, trim: true, maxlength: 300, default: null },
      setBy:         { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin", default: null },
      setAt:         { type: Date, default: null },
    },

    // ── Cancellation ─────────────────────────────────────────────────────────
    cancelledAt:  { type: Date, default: null },
    cancelReason: { type: String, trim: true, maxlength: 300, default: null },

    // ── Expiry reminder tracking ──────────────────────────────────────────────
    lastExpiryReminderAt: { type: Date, default: null },

    // ── Notes ────────────────────────────────────────────────────────────────
    adminNotes: { type: String, trim: true, maxlength: 500, default: null },

    // ── Change history ────────────────────────────────────────────────────────
    history: [historyEntrySchema],

    // ── Managed by ───────────────────────────────────────────────────────────
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin", default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) { delete ret.__v; return ret; },
    },
  }
);

// ─── Virtuals ─────────────────────────────────────────────────────────────────

subscriptionSchema.virtual("isLive").get(function () {
  return this.status === "active" && this.endDate > new Date();
});

subscriptionSchema.virtual("daysRemaining").get(function () {
  if (this.status !== "active") return 0;
  return Math.max(0, Math.ceil((this.endDate.getTime() - Date.now()) / 86_400_000));
});

// True while the society is in grace (endDate passed but within gracePeriodDays)
subscriptionSchema.virtual("inGracePeriod").get(function () {
  if (this.status !== "active") return false;
  const now = Date.now();
  const end = this.endDate.getTime();
  if (now <= end) return false;
  return now <= end + this.gracePeriodDays * 86_400_000;
});

// Effective lockout date = endDate + gracePeriodDays
subscriptionSchema.virtual("lockoutDate").get(function () {
  if (!this.endDate) return null;
  return new Date(this.endDate.getTime() + (this.gracePeriodDays || 0) * 86_400_000);
});

// ─── Static helpers ───────────────────────────────────────────────────────────

subscriptionSchema.statics.buildTrial = function (societyId, superAdminId) {
  const start = new Date();
  const end   = new Date(start.getTime() + TRIAL_DAYS * 86_400_000);
  return {
    society:          societyId,
    plan:             "trial",
    status:           "active",
    startDate:        start,
    endDate:          end,
    billingAnchorDay: start.getDate() > 28 ? 28 : start.getDate(),
    priceMonthly:     0,
    autoRenew:        false,
    createdBy:        superAdminId,
    history: [{
      action:      "created",
      toPlan:      "trial",
      toStatus:    "active",
      note:        `Trial started — ${TRIAL_DAYS} days`,
      performedBy: superAdminId,
    }],
  };
};

const Subscription = mongoose.model("Subscription", subscriptionSchema);
module.exports = { Subscription, PLANS, SUB_STATUSES, PLAN_LIMITS, PAYABLE_PLANS, TRIAL_DAYS };
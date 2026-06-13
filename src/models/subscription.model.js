/**
 * Subscription Model
 *
 * One subscription record per society (one-to-one).
 * Keeps the full change-history of plan upgrades, renewals, and cancellations
 * in the `history` array so super admins have a complete audit trail.
 *
 * Plans:
 *   trial   — 30 days free, max 50 residents, all features enabled. Auto-downgrades to "free" after expiry.
 *   free    — Permanent free plan, max 25 residents, core features (no expiry).
 *   basic   — ₹599/month, max 100 residents.
 *   premium — ₹999/month, unlimited residents, priority support.
 *
 * Status lifecycle:
 *   active → expired  (end-date passed, no renewal)
 *   active → suspended (super admin action — e.g. payment failure)
 *   active → cancelled (society owner requested cancellation)
 */
const mongoose = require("mongoose");

const PLANS         = Object.freeze(["trial", "free", "basic", "premium"]);
const SUB_STATUSES  = Object.freeze(["active", "expired", "suspended", "cancelled"]);
const PLAN_LIMITS   = Object.freeze({
  trial:   { maxResidents: 50,   priceMonthly: 0,   endDate: true  },
  free:    { maxResidents: 25,   priceMonthly: 0,   endDate: false },  // No expiry
  basic:   { maxResidents: 100,  priceMonthly: 599, endDate: true  },
  premium: { maxResidents: null, priceMonthly: 999, endDate: true  }, // null = unlimited
});
const TRIAL_DAYS    = 30;

const historyEntrySchema = new mongoose.Schema(
  {
    action:     { type: String, trim: true },   // e.g. "upgraded", "renewed", "suspended"
    fromPlan:   { type: String, default: null },
    toPlan:     { type: String, default: null },
    fromStatus: { type: String, default: null },
    toStatus:   { type: String, default: null },
    note:       { type: String, trim: true, default: null },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "SuperAdmin",
      default: null,
    },
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
      enum:    { values: PLANS, message: "Invalid plan" },
      default: "trial",
    },
    status: {
      type:    String,
      enum:    { values: SUB_STATUSES, message: "Invalid status" },
      default: "active",
      index:   true,
    },
    startDate:  { type: Date, required: true },
    endDate:    { type: Date, required: true, index: true },

    // ── Billing ───────────────────────────────────────────────────────────────
    priceMonthly: { type: Number, default: 0 },   // actual negotiated price (may differ from plan default)
    autoRenew:    { type: Boolean, default: false },

    // ── Cancellation ──────────────────────────────────────────────────────────
    cancelledAt:   { type: Date,   default: null },
    cancelReason:  { type: String, trim: true, maxlength: [300, "Reason too long"], default: null },

    // ── Expiry reminder tracking (Task 3) ─────────────────────────────────────
    // Updated by subscription.job.js each time a warning push/email is sent.
    // Prevents re-notifying within the same 24-hour window.
    lastExpiryReminderAt: { type: Date, default: null },

    // ── Notes ────────────────────────────────────────────────────────────────
    adminNotes: {
      type:      String,
      trim:      true,
      maxlength: [500, "Notes too long"],
      default:   null,
    },

    // ── Change history ────────────────────────────────────────────────────────
    history: [historyEntrySchema],

    // ── Managed by ───────────────────────────────────────────────────────────
    createdBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "SuperAdmin",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ─── Virtual: is subscription currently live? ──────────────────────────────
subscriptionSchema.virtual("isLive").get(function () {
  return this.status === "active" && this.endDate > new Date();
});

// ─── Virtual: days remaining ───────────────────────────────────────────────
subscriptionSchema.virtual("daysRemaining").get(function () {
  if (this.status !== "active") return 0;
  const diff = this.endDate.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
});

// ─── Static: build a fresh trial subscription data object ─────────────────
subscriptionSchema.statics.buildTrial = function (societyId, superAdminId) {
  const start = new Date();
  const end   = new Date(start.getTime() + TRIAL_DAYS * 86_400_000);
  return {
    society:      societyId,
    plan:         "trial",
    status:       "active",
    startDate:    start,
    endDate:      end,
    priceMonthly: 0,
    autoRenew:    false,
    createdBy:    superAdminId,
    history: [{
      action:     "created",
      toPlan:     "trial",
      toStatus:   "active",
      note:       `Trial started — ${TRIAL_DAYS} days`,
      performedBy: superAdminId,
    }],
  };
};

const Subscription = mongoose.model("Subscription", subscriptionSchema);
module.exports = { Subscription, PLANS, SUB_STATUSES, PLAN_LIMITS, TRIAL_DAYS };
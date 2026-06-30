/**
 * config/pricing.js
 *
 * Single source of truth for what each (plan, billingCycle) combination costs.
 * Both the order-creation step and the verify/webhook step read from here —
 * never trust an amount sent by the client.
 *
 * Cycle discount logic:
 *   monthly    → base price × 1,  no discount
 *   quarterly  → base price × 3,  8%  off  (3 months)
 *   halfyearly → base price × 6,  13% off  (6 months)
 *   annual     → base price × 10 (pay 10 months, get 12 — 2 months free)
 *
 * Amounts are in paise (smallest currency unit) because that's what
 * Razorpay's API expects everywhere.
 */
const { PLAN_LIMITS } = require("../models/subscription.model");

// Base monthly price per plan, in rupees (mirrors PLAN_LIMITS for clarity —
// kept separate so pricing logic doesn't silently change if the model's
// PLAN_LIMITS is edited for unrelated reasons, e.g. resident caps).
const BASE_MONTHLY_RUPEES = Object.freeze({
  basic:   PLAN_LIMITS.basic.priceMonthly,    // 599
  premium: PLAN_LIMITS.premium.priceMonthly,  // 999
});

const BILLING_CYCLES = Object.freeze({
  monthly: {
    label: "Monthly",
    months: 1,
    discountPct: 0,
  },
  quarterly: {
    label: "Quarterly (3 months)",
    months: 3,
    discountPct: 8,
  },
  halfyearly: {
    label: "Half-yearly (6 months)",
    months: 6,
    discountPct: 13,
  },
  annual: {
    label: "Annual — pay 10 months, get 12",
    months: 12,
    // Annual is priced as exactly 10× the monthly base (2 months free),
    // not a flat % — so compute it as a fixed multiplier instead of a
    // percentage discount to avoid rounding drift.
    payMonths: 10,
    discountPct: null,
  },
});

const PAYABLE_PLANS = Object.freeze(["basic", "premium"]);

/**
 * Compute the rupee amount for a given plan + billing cycle.
 * Returns null if the plan/cycle combination is invalid.
 *
 * @param {string} plan
 * @param {string} billingCycle
 * @param {number|null} overrideMonthlyRupees — if provided (a society's
 *   negotiated customPricing.monthlyRupees), this replaces the plan's
 *   standard BASE_MONTHLY_RUPEES for this calculation. The billing-cycle
 *   discount logic still applies on top of it, so a custom monthly rate
 *   still benefits from quarterly/half-yearly/annual discounts the same
 *   way the standard rate does.
 */
function computeAmountRupees(plan, billingCycle, overrideMonthlyRupees = null) {
  if (!PAYABLE_PLANS.includes(plan)) return null;
  const cycle = BILLING_CYCLES[billingCycle];
  if (!cycle) return null;

  const base = overrideMonthlyRupees != null ? overrideMonthlyRupees : BASE_MONTHLY_RUPEES[plan];

  if (billingCycle === "annual") {
    return Math.round(base * cycle.payMonths); // e.g. custom 299 × 10 = 2990
  }

  const fullPrice = base * cycle.months;
  const discounted = fullPrice * (1 - cycle.discountPct / 100);
  // Round to nearest rupee — Razorpay amounts must be integer paise.
  return Math.round(discounted);
}

/**
 * Returns { amountRupees, amountPaise, months } for a plan+cycle,
 * or throws if invalid (caller is expected to validate plan/cycle via Joi
 * first, but this is a defensive second check before touching money).
 *
 * @param {number|null} overrideMonthlyRupees — see computeAmountRupees above.
 *   Pass the society's Subscription.customPricing.monthlyRupees here when
 *   customPricing.enabled is true; omit/null for the standard rate.
 */
function getPricing(plan, billingCycle, overrideMonthlyRupees = null) {
  const amountRupees = computeAmountRupees(plan, billingCycle, overrideMonthlyRupees);
  if (amountRupees === null) {
    const AppError = require("../utils/AppError");
    throw AppError.badRequest(`Invalid plan/billingCycle combination: ${plan}/${billingCycle}`);
  }
  // Razorpay rejects orders below ₹1 (100 paise). A custom price of ₹0
  // should be modeled as the "free" plan instead, which never reaches this
  // payable-order code path — so this is a defensive guard, not the normal case.
  if (amountRupees < 1) {
    const AppError = require("../utils/AppError");
    throw AppError.badRequest("Amount must be at least ₹1. Use the free plan for ₹0 societies.");
  }
  return {
    amountRupees,
    amountPaise: amountRupees * 100,
    months: BILLING_CYCLES[billingCycle].months,
    isCustomPricing: overrideMonthlyRupees != null,
  };
}

/** Full price list for all plan × cycle combos — used by GET /payments/pricing */
function getAllPricing() {
  const table = {};
  for (const plan of PAYABLE_PLANS) {
    table[plan] = {};
    for (const cycleKey of Object.keys(BILLING_CYCLES)) {
      const { amountRupees, months } = getPricing(plan, cycleKey);
      const monthlyEquivalent = Math.round(amountRupees / months);
      table[plan][cycleKey] = {
        label:             BILLING_CYCLES[cycleKey].label,
        months,
        amountRupees,
        monthlyEquivalent,
      };
    }
  }
  return table;
}

module.exports = {
  BASE_MONTHLY_RUPEES,
  BILLING_CYCLES,
  PAYABLE_PLANS,
  computeAmountRupees,
  getPricing,
  getAllPricing,
};
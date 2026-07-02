/**
 * config/pricing.js
 *
 * Single source of truth for subscription and module pricing.
 *
 * Plans (per requirements doc):
 *   Starter      ₹599/mo  — Issues + Visitors
 *   Professional ₹999/mo  — + Maintenance + Amenities
 *   Enterprise   ₹1799/mo — everything
 *
 * Billing cycle discounts:
 *   monthly    → ×1,  no discount
 *   quarterly  → ×3,  8% off
 *   halfyearly → ×6,  13% off
 *   annual     → ×10  (pay 10 months, get 12 — 2 months free)
 *
 * All amounts computed server-side — never trust client-supplied numbers.
 * Razorpay requires integer paise (amount × 100).
 *
 * PRORATION (new — per requirements):
 *   When a module is added mid-cycle, charge only for remaining days:
 *     proratedRupees = Math.ceil(monthlyPrice × daysLeft / daysInCycle)
 *   The helper computeProratedAmount() implements this.
 *
 * UPGRADE CREDIT (new — per requirements):
 *   When upgrading plan mid-cycle, the unused portion of the current plan
 *   is credited against the new plan's cost:
 *     credit       = Math.floor((daysLeft / totalDays) × amountPaid)
 *     newPlanCost  = getPricing(newPlan, cycle)
 *     chargeAmount = Math.max(1, newPlanCost − credit)
 *
 * DISCOUNT (new — per requirements):
 *   Applied after base amount is computed, before minimum-₹1 guard.
 *   Priority: flatRupees first, then pct.
 *   computeDiscountedAmount(base, discount) → rupees.
 */

const { PLAN_LIMITS, PAYABLE_PLANS } = require("../models/subscription.model");

// ── Base monthly prices ───────────────────────────────────────────────────────

const BASE_MONTHLY_RUPEES = Object.freeze({
  starter:      PLAN_LIMITS.starter.priceMonthly,       // 599
  professional: PLAN_LIMITS.professional.priceMonthly,  // 999
  enterprise:   PLAN_LIMITS.enterprise.priceMonthly,    // 1799
});

// ── Billing cycles ────────────────────────────────────────────────────────────

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
    payMonths: 10,
    discountPct: null,  // fixed multiplier, not pct
  },
});

// ── Core amount calculator ────────────────────────────────────────────────────

/**
 * Compute rupees for a plan + cycle combination.
 * @param {string}      plan
 * @param {string}      billingCycle
 * @param {number|null} overrideMonthlyRupees  — society's negotiated rate, if any
 * @returns {number|null}
 */
function computeAmountRupees(plan, billingCycle, overrideMonthlyRupees = null) {
  if (!PAYABLE_PLANS.includes(plan)) return null;
  const cycle = BILLING_CYCLES[billingCycle];
  if (!cycle) return null;

  const base = overrideMonthlyRupees != null
    ? overrideMonthlyRupees
    : BASE_MONTHLY_RUPEES[plan];

  if (billingCycle === "annual") {
    return Math.round(base * cycle.payMonths); // e.g. 599 × 10 = 5990
  }
  return Math.round(base * cycle.months * (1 - (cycle.discountPct || 0) / 100));
}

/**
 * Returns { amountRupees, amountPaise, months, isCustomPricing } or throws.
 */
function getPricing(plan, billingCycle, overrideMonthlyRupees = null) {
  const amountRupees = computeAmountRupees(plan, billingCycle, overrideMonthlyRupees);
  if (amountRupees === null) {
    const AppError = require("../utils/AppError");
    throw AppError.badRequest(`Invalid plan/billingCycle: ${plan}/${billingCycle}`);
  }
  if (amountRupees < 1) {
    const AppError = require("../utils/AppError");
    throw AppError.badRequest(
      "This society has a ₹0 rate — grant the plan directly via the SA portal instead of charging ₹0 through Razorpay."
    );
  }
  return {
    amountRupees,
    amountPaise: amountRupees * 100,
    months: BILLING_CYCLES[billingCycle].months,
    isCustomPricing: overrideMonthlyRupees != null,
  };
}

/** Full price table for all plan × cycle combos. Used by GET /payments/pricing. */
function getAllPricing() {
  const table = {};
  for (const plan of PAYABLE_PLANS) {
    table[plan] = {};
    for (const cycleKey of Object.keys(BILLING_CYCLES)) {
      const { amountRupees, months } = getPricing(plan, cycleKey);
      table[plan][cycleKey] = {
        label:             BILLING_CYCLES[cycleKey].label,
        months,
        amountRupees,
        monthlyEquivalent: Math.round(amountRupees / months),
      };
    }
  }
  return table;
}

// ── Proration ─────────────────────────────────────────────────────────────────

/**
 * Compute the prorated charge for adding something mid-cycle.
 *
 * Used when a society buys a module (or upgrades a plan) AFTER their billing
 * anchor date — they pay only for the remaining days in the current cycle so
 * everything expires together on the same date.
 *
 * @param {number} monthlyRupees   Full monthly price of what's being added
 * @param {Date}   endDate         Society's current subscription endDate (= next renewal)
 * @param {number} daysInCycle     Total days in the current billing cycle (30 × months)
 * @returns {{ proratedRupees, daysLeft, daysInCycle }}
 */
function computeProratedAmount(monthlyRupees, endDate, daysInCycle = 30) {
  const now      = Date.now();
  const msLeft   = Math.max(0, new Date(endDate).getTime() - now);
  const daysLeft = Math.ceil(msLeft / 86_400_000);

  // If fewer than 1 day left just charge for 1 day to avoid ₹0 edge case
  const effectiveDaysLeft = Math.max(1, daysLeft);
  const proratedRupees    = Math.ceil(monthlyRupees * effectiveDaysLeft / daysInCycle);

  return { proratedRupees, daysLeft: effectiveDaysLeft, daysInCycle };
}

// ── Upgrade credit ────────────────────────────────────────────────────────────

/**
 * When upgrading plans mid-cycle, credit the unused portion of what was
 * already paid against the new plan's cost — the customer pays the delta.
 *
 * Example (from requirements doc):
 *   Starter paid ₹599 for 30 days, 20 days used, 10 days left.
 *   Credit = ₹599 × 10/30 = ₹200 (rounded down).
 *   Professional monthly = ₹999 prorated 10 days = ₹333.
 *   Customer pays ₹333 − ₹200 = ₹133.
 *
 * @param {number} paidAmount       Total amount paid for the current cycle
 * @param {number} totalDays        Total days in current cycle
 * @param {number} daysLeft         Days remaining in current cycle
 * @param {number} newPlanProrated  Prorated cost of new plan for remaining days
 * @returns {{ credit, chargeRupees }}
 */
function computeUpgradeCredit(paidAmount, totalDays, daysLeft, newPlanProrated) {
  const credit       = Math.floor(paidAmount * (daysLeft / totalDays));
  const chargeRupees = Math.max(1, newPlanProrated - credit);
  return { credit, chargeRupees };
}

// ── Discount application ──────────────────────────────────────────────────────

/**
 * Apply a coupon/discount to a base rupee amount.
 * discount = { pct?, flatRupees?, validUntil? } from Subscription.discount.
 * Returns the discounted amount (minimum ₹1).
 *
 * @param {number} baseRupees
 * @param {object|null} discount
 * @returns {number} discountedRupees
 */
function computeDiscountedAmount(baseRupees, discount) {
  if (!discount) return baseRupees;
  if (discount.validUntil && new Date(discount.validUntil) < new Date()) return baseRupees;

  let result = baseRupees;
  if (discount.flatRupees != null && discount.flatRupees > 0) {
    result = result - discount.flatRupees;
  } else if (discount.pct != null && discount.pct > 0) {
    result = result * (1 - discount.pct / 100);
  }
  return Math.max(1, Math.round(result));
}

// ── Module pricing ────────────────────────────────────────────────────────────

/**
 * Compute rupees for a custom set of paid modules.
 * Supports proration: if sub is active and endDate is provided, charges
 * only for remaining days instead of the full monthly price.
 *
 * @param {string[]} moduleKeys
 * @param {object|null} moduleCharges   society.moduleCharges
 * @param {object|null} prorateOptions  { endDate, daysInCycle } — omit for full-month
 * @returns {{ amountRupees, amountPaise, breakdown, isProrated }}
 */
function computeModulesAmountRupees(moduleKeys, moduleCharges = null, prorateOptions = null) {
  const { PAID_MODULES, DEFAULT_MODULE_PRICES } = require("../models/society.model");

  const breakdown = moduleKeys.map((key) => {
    if (!PAID_MODULES.includes(key)) {
      const AppError = require("../utils/AppError");
      throw AppError.badRequest(`'${key}' is not a valid paid module.`);
    }
    const custom         = moduleCharges?.[key] != null ? moduleCharges[key] : null;
    const monthlyRupees  = custom != null ? custom : (DEFAULT_MODULE_PRICES[key] ?? 0);

    let chargedRupees = monthlyRupees;
    let daysLeft = null;
    let daysInCycle = null;

    if (prorateOptions?.endDate) {
      const p = computeProratedAmount(monthlyRupees, prorateOptions.endDate, prorateOptions.daysInCycle || 30);
      chargedRupees = p.proratedRupees;
      daysLeft      = p.daysLeft;
      daysInCycle   = p.daysInCycle;
    }

    return {
      module:          key,
      monthlyRupees,
      chargedRupees,
      isCustomPricing: custom != null && custom !== DEFAULT_MODULE_PRICES[key],
      ...(daysLeft != null ? { daysLeft, daysInCycle } : {}),
    };
  });

  const amountRupees = breakdown.reduce((s, b) => s + b.chargedRupees, 0);
  return {
    amountRupees,
    breakdown,
    isProrated: Boolean(prorateOptions?.endDate),
  };
}

function getModulesPricing(moduleKeys, moduleCharges = null, prorateOptions = null) {
  const AppError = require("../utils/AppError");
  if (!Array.isArray(moduleKeys) || moduleKeys.length === 0) {
    throw AppError.badRequest("Select at least one module to purchase.");
  }
  const result = computeModulesAmountRupees(moduleKeys, moduleCharges, prorateOptions);
  if (result.amountRupees < 1) {
    throw AppError.badRequest("Amount must be at least ₹1.");
  }
  return { ...result, amountPaise: result.amountRupees * 100 };
}

module.exports = {
  BASE_MONTHLY_RUPEES,
  BILLING_CYCLES,
  PAYABLE_PLANS,
  computeAmountRupees,
  computeProratedAmount,
  computeUpgradeCredit,
  computeDiscountedAmount,
  getPricing,
  getAllPricing,
  computeModulesAmountRupees,
  getModulesPricing,
};
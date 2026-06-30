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
  // Razorpay rejects orders below ₹1 (100 paise). If a Super Admin has set
  // this society's customPricing.monthlyRupees to 0 (fully comped), that
  // society should never reach this payable-order code path in the first
  // place — the upgrade screen should already be hiding the "Pay" button
  // for a ₹0-rate society (see UpgradeScreen.jsx's isFreeOverride check).
  // This is a defensive guard for if that ever gets bypassed, not the
  // normal flow: a ₹0 society is granted access by setting their plan
  // directly (SA → Manage Pricing → Grant Plan Directly), not by trying to
  // process a ₹0 Razorpay order, which Razorpay itself won't accept.
  if (amountRupees < 1) {
    const AppError = require("../utils/AppError");
    throw AppError.badRequest(
      "This society has a ₹0 rate set — they should be granted the plan directly instead of paying ₹0 through Razorpay. Use 'Grant Plan Directly' in the Super Admin pricing screen."
    );
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

/**
 * Compute the rupee amount for purchasing a custom set of paid modules
 * directly (no plan attached) — used by the "pick your own modules"
 * checkout flow, as opposed to buying a fixed basic/premium plan.
 *
 * Per-module price comes from the society's negotiated `moduleCharges`
 * if set, else falls back to DEFAULT_MODULE_PRICES — exactly the same
 * resolution order the module-status screen already uses to DISPLAY
 * prices, so what the admin sees on the upgrade screen is exactly what
 * they're charged at checkout.
 *
 * @param {string[]} moduleKeys      - e.g. ["visitors", "maintenance"]
 * @param {object}    moduleCharges   - society.moduleCharges (Mongoose subdoc or plain object), may be null
 * @returns {{ amountRupees, amountPaise, breakdown: {module, amountRupees}[] }}
 */
function computeModulesAmountRupees(moduleKeys, moduleCharges = null) {
  const { PAID_MODULES, DEFAULT_MODULE_PRICES } = require("../models/society.model");

  const breakdown = moduleKeys.map((key) => {
    if (!PAID_MODULES.includes(key)) {
      const AppError = require("../utils/AppError");
      throw AppError.badRequest(`'${key}' is not a valid paid module.`);
    }
    const custom = moduleCharges && moduleCharges[key] != null ? moduleCharges[key] : null;
    const amountRupees = custom != null ? custom : (DEFAULT_MODULE_PRICES[key] ?? 0);
    return { module: key, amountRupees };
  });

  const amountRupees = breakdown.reduce((sum, b) => sum + b.amountRupees, 0);
  return { amountRupees, breakdown };
}

/**
 * Returns { amountRupees, amountPaise, breakdown } for a set of modules,
 * or throws if the total is below ₹1 (Razorpay's minimum) or the list is empty.
 * Mirrors getPricing()'s defensive-guard pattern for plan purchases.
 */
function getModulesPricing(moduleKeys, moduleCharges = null) {
  const AppError = require("../utils/AppError");
  if (!Array.isArray(moduleKeys) || moduleKeys.length === 0) {
    throw AppError.badRequest("Select at least one module to purchase.");
  }
  const { amountRupees, breakdown } = computeModulesAmountRupees(moduleKeys, moduleCharges);
  if (amountRupees < 1) {
    throw AppError.badRequest("Amount must be at least ₹1.");
  }
  return {
    amountRupees,
    amountPaise: amountRupees * 100,
    breakdown,
  };
}

module.exports = {
  BASE_MONTHLY_RUPEES,
  BILLING_CYCLES,
  PAYABLE_PLANS,
  computeAmountRupees,
  getPricing,
  getAllPricing,
  computeModulesAmountRupees,
  getModulesPricing,
};
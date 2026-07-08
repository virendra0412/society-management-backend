/**
 * validators/payment.validator.js
 */
const Joi = require("joi");
const { PAYABLE_PLANS, BILLING_CYCLES } = require("../models/payment.model");
const { PAID_MODULES } = require("../models/society.model");

const createOrder = Joi.object({
  plan:         Joi.string().valid(...PAYABLE_PLANS).required(),
  billingCycle: Joi.string().valid(...BILLING_CYCLES).required(),
});

// Upgrade mid-cycle: charges credit from unused current plan
const createUpgradeOrder = Joi.object({
  plan:         Joi.string().valid(...PAYABLE_PLANS).required(),
  billingCycle: Joi.string().valid(...BILLING_CYCLES).required(),
});

const createModulesOrder = Joi.object({
  modules: Joi.array()
    .items(Joi.string().valid(...PAID_MODULES))
    .min(1)
    .unique()
    .required(),
  // Optional: force full-month price even if a subscription is active.
  // Default false — backend prorates automatically when sub is active.
  forceFullMonth: Joi.boolean().default(false),
});

const verifyPayment = Joi.object({
  razorpay_order_id:   Joi.string().required(),
  razorpay_payment_id: Joi.string().required(),
  razorpay_signature:  Joi.string().required(),
});

// Preview proration before the admin commits to checkout
const previewModules = Joi.object({
  modules: Joi.array()
    .items(Joi.string().valid(...PAID_MODULES))
    .min(1)
    .unique()
    .required(),
});

// Preview upgrade credit before plan upgrade checkout
const previewUpgrade = Joi.object({
  plan:         Joi.string().valid(...PAYABLE_PLANS).required(),
  billingCycle: Joi.string().valid(...BILLING_CYCLES).required(),
});

module.exports = {
  createOrder,
  createUpgradeOrder,
  createModulesOrder,
  previewModules,
  previewUpgrade,
  verifyPayment,
};
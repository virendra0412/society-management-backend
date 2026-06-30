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

const createModulesOrder = Joi.object({
  modules: Joi.array()
    .items(Joi.string().valid(...PAID_MODULES))
    .min(1)
    .unique()
    .required(),
});

const verifyPayment = Joi.object({
  razorpay_order_id:   Joi.string().required(),
  razorpay_payment_id: Joi.string().required(),
  razorpay_signature:  Joi.string().required(),
});

module.exports = { createOrder, createModulesOrder, verifyPayment };
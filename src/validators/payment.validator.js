/**
 * validators/payment.validator.js
 */
const Joi = require("joi");
const { PAYABLE_PLANS, BILLING_CYCLES } = require("../models/payment.model");

const createOrder = Joi.object({
  plan:         Joi.string().valid(...PAYABLE_PLANS).required(),
  billingCycle: Joi.string().valid(...BILLING_CYCLES).required(),
});

const verifyPayment = Joi.object({
  razorpay_order_id:   Joi.string().required(),
  razorpay_payment_id: Joi.string().required(),
  razorpay_signature:  Joi.string().required(),
});

module.exports = { createOrder, verifyPayment };
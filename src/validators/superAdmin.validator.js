const Joi = require("joi");
const { PLANS } = require("../models/subscription.model");

// ── Auth ──────────────────────────────────────────────────────────────────────

const login = Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().required(),
});

const refreshToken = Joi.object({
  refreshToken: Joi.string().required(),
});

const changePassword = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword:     Joi.string().min(10).required(),
});

// ── Society Applications ──────────────────────────────────────────────────────

const applyForSociety = Joi.object({
  societyName:  Joi.string().min(3).max(120).trim().required(),
  address:      Joi.string().min(5).max(300).trim().required(),
  city:         Joi.string().max(80).trim().required(),
  state:        Joi.string().max(80).trim().required(),
  totalUnits:   Joi.number().integer().min(1).max(5000).required(),
  description:  Joi.string().max(500).trim().optional().allow(""),
  adminName:    Joi.string().min(2).max(80).trim().required(),
  adminEmail:   Joi.string().email().required(),
  adminPhone:   Joi.string().pattern(/^\+?[0-9]{7,15}$/).required(),
});

const reviewApplication = Joi.object({
  note: Joi.string().max(500).trim().optional().allow(""),
});

// ── Society Management ────────────────────────────────────────────────────────

const updateSubscription = Joi.object({
  plan:         Joi.string().valid(...PLANS),
  status:       Joi.string().valid("active", "expired", "suspended", "cancelled"),
  endDate:      Joi.date().iso(),
  priceMonthly: Joi.number().min(0),
  autoRenew:    Joi.boolean(),
  adminNotes:   Joi.string().max(500).trim().allow(""),
  note:         Joi.string().max(300).trim().allow(""),   // history entry note
}).min(1);

const transferAdmin = Joi.object({
  newAdminUserId: Joi.string().hex().length(24).required()
    .messages({ "string.length": "Invalid user ID" }),
  note: Joi.string().max(300).trim().optional().allow(""),
});

const reactivateSociety = Joi.object({
  note: Joi.string().max(300).trim().optional().allow(""),
});

const suspendSociety = Joi.object({
  reason: Joi.string().max(300).trim().required(),
});

const resetAdminPassword = Joi.object({
  newPassword: Joi.string().min(8).required(),
  sendEmail:   Joi.boolean().default(false),
});

module.exports = {
  login,
  refreshToken,
  changePassword,
  applyForSociety,
  reviewApplication,
  updateSubscription,
  transferAdmin,
  reactivateSociety,
  suspendSociety,
  resetAdminPassword,
};

// ── Module Management ─────────────────────────────────────────────────────────

const PAID_MODULE_KEYS = [
  "issues", "visitors", "maintenance", "amenities",
  "events", "parking", "community", "analytics", "multilang",
];

const moduleToggleObj = Joi.object().pattern(
  Joi.string().valid(...PAID_MODULE_KEYS),
  Joi.boolean()
);

const moduleChargesObj = Joi.object().pattern(
  Joi.string().valid(...PAID_MODULE_KEYS),
  Joi.number().min(0).max(9999)
);

const updateModules = Joi.object({
  modules: moduleToggleObj.optional(),
  charges: moduleChargesObj.optional(),
}).min(1);

const applyBundle = Joi.object({
  bundle:     Joi.string().valid("starter", "operations", "fullstack").required(),
  replaceAll: Joi.boolean().default(false),
});

Object.assign(module.exports, { updateModules, applyBundle });
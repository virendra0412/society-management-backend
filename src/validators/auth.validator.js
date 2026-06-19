/**
 * validators/auth.validator.js
 *
 * CHANGED IN TASK 1:
 *   register — added optional `inviteToken` field.
 *              `societyJoinCode` stays unchanged so existing flow still works.
 *
 * Everything else is identical to the original.
 */

const Joi = require("joi");

const password = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  .messages({
    "string.pattern.base":
      "Password must contain at least one uppercase letter, one lowercase letter, and one number",
    "string.min": "Password must be at least 8 characters",
  });

const register = Joi.object({
  name:     Joi.string().min(2).max(80).trim().required(),
  email:    Joi.string().email().lowercase().trim().required(),
  phone:    Joi.string()
    .pattern(/^\+?[0-9]{7,15}$/)
    .optional()
    .messages({ "string.pattern.base": "Invalid phone number" }),
  password: password.required(),

  // ── Original join code (still supported) ──────────────────────────────────
  societyJoinCode: Joi.string().length(8).uppercase().optional(),

  // ── NEW: invite-link JWT token ─────────────────────────────────────────────
  // When present, backend resolves societyId from the token instead of join code.
  // Client sends EITHER societyJoinCode OR inviteToken, not both.
  inviteToken: Joi.string().optional(),

  flat: Joi.string().max(20).trim().optional(),
  wing: Joi.string().max(30).trim().optional(),
  termsAccepted: Joi.boolean().valid(true).required().messages({
    "any.only": "You must accept the Terms & Conditions.",
    "any.required": "You must accept the Terms & Conditions.",
  }),
  privacyAccepted: Joi.boolean().valid(true).required().messages({
    "any.only": "You must accept the Privacy Policy.",
    "any.required": "You must accept the Privacy Policy.",
  }),
  legalAcceptedAt: Joi.date().iso().optional(),
})
// Ensure the client doesn't send both at once (ambiguous intent)
.and() // no mutual exclusivity needed — service resolves priority: inviteToken > joinCode
;

const login = Joi.object({
  email:    Joi.string().email().lowercase().trim().required(),
  password: Joi.string().required(),
});

const refreshToken = Joi.object({
  refreshToken: Joi.string().required(),
});

const forgotPassword = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
});

const resetPassword = Joi.object({
  email:       Joi.string().email().lowercase().trim().required(),
  otp:         Joi.string().length(6).pattern(/^\d{6}$/).required().messages({
    "string.length":       "OTP must be 6 digits",
    "string.pattern.base": "OTP must be numeric",
  }),
  newPassword: password.required(),
});

const changePassword = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: password.required(),
});

// Unauthenticated counterpart to changePassword — used the very first time a
// user with a temp password (e.g. newly approved admin) logs in. Identified
// by email since there's no JWT yet.
const forceChangePassword = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  currentPassword: Joi.string().required(),
  newPassword: password.required(),
});

const switchSociety = Joi.object({
  societyId: Joi.string().hex().length(24).required().messages({
    "string.hex":    "Invalid society ID",
    "string.length": "Invalid society ID",
  }),
});

const joinSociety = Joi.object({
  societyJoinCode: Joi.string().length(8).uppercase().optional(),
  inviteToken: Joi.string().optional(),
  flat: Joi.string().max(20).trim().optional(),
  wing: Joi.string().max(30).trim().optional(),
}).or("societyJoinCode", "inviteToken");

module.exports = {
  register,
  login,
  refreshToken,
  forgotPassword,
  resetPassword,
  switchSociety,
  joinSociety,
  changePassword,
  forceChangePassword,
};
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
  name: Joi.string().min(2).max(80).trim().required(),
  email: Joi.string().email().lowercase().trim().required(),
  phone: Joi.string()
    .pattern(/^\+?[0-9]{7,15}$/)
    .optional()
    .messages({ "string.pattern.base": "Invalid phone number" }),
  password: password.required(),
  societyJoinCode: Joi.string().length(8).uppercase().optional(),
  flat: Joi.string().max(20).trim().optional(),
  // wing = Block/Wing identifier (e.g. "A", "Block B", "East Wing")
  wing: Joi.string().max(30).trim().optional(),
});

const login = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().required(),
});

const refreshToken = Joi.object({
  refreshToken: Joi.string().required(),
});

// ── NEW: Forgot password — just needs email ────────────────────────────────
const forgotPassword = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
});

// ── NEW: Reset password — OTP + new password ──────────────────────────────
const resetPassword = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  otp: Joi.string().length(6).pattern(/^\d{6}$/).required().messages({
    "string.length": "OTP must be 6 digits",
    "string.pattern.base": "OTP must be numeric",
  }),
  newPassword: password.required(),
});

module.exports = { register, login, refreshToken, forgotPassword, resetPassword };

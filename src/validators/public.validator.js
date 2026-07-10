const Joi = require("joi");

// ─── Public Contact Form (marketing website) ───────────────────────────────
// Mirrors the fields already collected by the Next.js contact page —
// keep this in sync with app/contact/page.tsx on the website repo.
const contactUs = {
  submit: Joi.object({
    name: Joi.string().min(2).max(100).trim().required().messages({
      "string.empty": "Name is required.",
      "any.required": "Name is required.",
    }),
    email: Joi.string().email().trim().lowercase().required().messages({
      "string.email": "Enter a valid email address.",
      "any.required": "Email is required.",
    }),
    phone: Joi.string()
      .pattern(/^\+?[0-9\s\-()]{7,20}$/)
      .trim()
      .optional()
      .allow("")
      .messages({ "string.pattern.base": "Enter a valid phone number." }),
    society: Joi.string().max(150).trim().optional().allow(""),
    units: Joi.string().max(20).trim().optional().allow(""),
    message: Joi.string().min(5).max(2000).trim().required().messages({
      "string.min": "Message is too short.",
      "any.required": "Message is required.",
    }),
    type: Joi.string()
      .valid("demo", "pricing", "support", "partnership", "press", "other")
      .default("other"),
  }),
};

// ─── Public Demo Request (marketing website) ───────────────────────────────
// Mirrors the fields collected by the Next.js /demo booking form —
// keep in sync with app/api/demo/route.ts's DemoPayload on the website repo.
const demoRequest = {
  submit: Joi.object({
    name: Joi.string().min(2).max(100).trim().required().messages({
      "string.empty": "Name is required.",
      "any.required": "Name is required.",
    }),
    email: Joi.string().email().trim().lowercase().required().messages({
      "string.email": "Enter a valid email address.",
      "any.required": "Email is required.",
    }),
    phone: Joi.string()
      .pattern(/^\+?[0-9\s\-()]{7,20}$/)
      .trim()
      .optional()
      .allow("")
      .messages({ "string.pattern.base": "Enter a valid phone number." }),
    society: Joi.string().max(150).trim().optional().allow(""),
    units: Joi.string().max(20).trim().optional().allow(""),
    // Free-text preferred slot (e.g. "Tuesday 3 PM") — see note in the
    // website's DemoPayload about eventually replacing this with a real
    // booking integration.
    preferredSlot: Joi.string().max(100).trim().optional().allow(""),
    notes: Joi.string().max(2000).trim().optional().allow(""),
  }),
};

module.exports = { contactUs, demoRequest };
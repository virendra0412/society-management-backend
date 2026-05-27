const Joi = require("joi");
const { CATEGORIES, PRIORITIES, STATUSES } = require("../models/issue.model");
const { HELP_CATEGORIES } = require("../models/help.model");
const { NOTICE_TAGS } = require("../models/notice.model");
const { CONTACT_GROUPS } = require("../models/contact.model");

// ─── Issues ───────────────────────────────────────────────────────────────────
const issue = {
  create: Joi.object({
    title: Joi.string().min(5).max(150).trim().required(),
    description: Joi.string().max(2000).trim().optional().allow(""),
    category: Joi.string().valid(...CATEGORIES).required(),
    priority: Joi.string().valid(...PRIORITIES).default("Medium"),
    photos: Joi.array().items(Joi.string().uri()).max(5).default([]),
    isAnonymous: Joi.boolean().default(false),
  }),

  update: Joi.object({
    status: Joi.string().valid(...STATUSES),
    priority: Joi.string().valid(...PRIORITIES),
    assignedTo: Joi.string().hex().length(24),
  }).min(1),

  comment: Joi.object({
    body: Joi.string().min(1).max(1000).trim().required(),
  }),

  // ── NEW: Assign external vendor ──────────────────────────────────────────
  assignVendor: Joi.object({
    name: Joi.string().min(2).max(100).trim().required(),
    phone: Joi.string()
      .pattern(/^\+?[0-9\s\-()]{7,20}$/)
      .required()
      .messages({ "string.pattern.base": "Invalid vendor phone number" }),
    note: Joi.string().max(500).trim().optional().allow(""),
  }),
};

// ─── Help ─────────────────────────────────────────────────────────────────────
const help = {
  create: Joi.object({
    title: Joi.string().min(5).max(150).trim().required(),
    description: Joi.string().max(1500).trim().optional().allow(""),
    category: Joi.string().valid(...HELP_CATEGORIES).required(),
  }),

  reply: Joi.object({
    body: Joi.string().min(1).max(1000).trim().required(),
    isVendorContact: Joi.boolean().default(false),
    vendorPhone: Joi.when("isVendorContact", {
      is: true,
      then: Joi.string()
        .pattern(/^\+?[0-9]{7,15}$/)
        .required()
        .messages({ "string.pattern.base": "Invalid phone number" }),
      otherwise: Joi.forbidden(),
    }),
  }),
};

// ─── Notices ──────────────────────────────────────────────────────────────────
const notice = {
  create: Joi.object({
    title: Joi.string().min(3).max(150).trim().required(),
    body: Joi.string().min(5).max(3000).trim().required(),
    tag: Joi.string().valid(...NOTICE_TAGS).default("Notice"),
    publishAt: Joi.date().iso().min("now").optional(),
    isPinned: Joi.boolean().default(false),
  }),

  // ── NEW: Pin/unpin body ────────────────────────────────────────────────────
  pin: Joi.object({
    isPinned: Joi.boolean().required(),
  }),
};

// ─── Polls ────────────────────────────────────────────────────────────────────
const poll = {
  create: Joi.object({
    question: Joi.string().min(5).max(300).trim().required(),
    options: Joi.array()
      .items(Joi.object({ label: Joi.string().min(1).max(100).trim().required() }))
      .min(2)
      .max(6)
      .required(),
    closesAt: Joi.date().iso().min("now").optional(),
    isAnonymous: Joi.boolean().default(true),
  }),

  vote: Joi.object({
    optionId: Joi.string().hex().length(24).required(),
  }),
};

// ─── Contacts ─────────────────────────────────────────────────────────────────
const phonePattern = /^\+?[0-9\s\-()]{7,20}$/;

const contact = {
  create: Joi.object({
    name: Joi.string().min(2).max(100).trim().required(),
    phone: Joi.string()
      .pattern(phonePattern)
      .required()
      .messages({ "string.pattern.base": "Invalid phone number format" }),
    group: Joi.string().valid(...CONTACT_GROUPS).required(),
    designation: Joi.string().max(80).trim().optional().allow(""),
    icon: Joi.string().optional(),
    sortOrder: Joi.number().integer().min(0).default(0),
  }),

  // ── NEW: Partial update (all fields optional) ────────────────────────────
  update: Joi.object({
    name: Joi.string().min(2).max(100).trim(),
    phone: Joi.string()
      .pattern(phonePattern)
      .messages({ "string.pattern.base": "Invalid phone number format" }),
    group: Joi.string().valid(...CONTACT_GROUPS),
    designation: Joi.string().max(80).trim().allow(""),
    icon: Joi.string(),
    sortOrder: Joi.number().integer().min(0),
  }).min(1),
};

// ─── Profile ──────────────────────────────────────────────────────────────────
const profile = {
  update: Joi.object({
    name: Joi.string().min(2).max(80).trim(),
    phone: Joi.string()
      .pattern(/^\+?[0-9]{7,15}$/)
      .messages({ "string.pattern.base": "Invalid phone number" }),
    flat: Joi.string().max(20).trim(),
    // wing = Block/Wing identifier (e.g. "A", "Block B", "East Wing")
    wing: Joi.string().max(30).trim().allow("", null),
  }).min(1),
};

// ─── Family Member ────────────────────────────────────────────────────────────
// ── NEW ──
const familyMember = {
  create: Joi.object({
    name: Joi.string().min(2).max(80).trim().required(),
    relation: Joi.string().max(40).trim().optional().allow(""),
    phone: Joi.string()
      .pattern(/^\+?[0-9]{7,15}$/)
      .optional()
      .messages({ "string.pattern.base": "Invalid phone number" }),
  }),

  update: Joi.object({
    name: Joi.string().min(2).max(80).trim(),
    relation: Joi.string().max(40).trim().allow(""),
    phone: Joi.string()
      .pattern(/^\+?[0-9]{7,15}$/)
      .messages({ "string.pattern.base": "Invalid phone number" }),
  }).min(1),
};

module.exports = { issue, help, notice, poll, contact, profile, familyMember };

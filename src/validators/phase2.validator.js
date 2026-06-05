const Joi = require("joi");
const { VISIT_PURPOSES } = require("../models/visitor.model");

// ─── Visitor Validators ────────────────────────────────────────────────────────
const visitor = {

  // Resident creating a pre-approved invite
  createInvite: Joi.object({
    name: Joi.string().min(2).max(100).trim().required(),
    phone: Joi.string()
      .pattern(/^\+?[0-9]{7,15}$/)
      .optional()
      .messages({ "string.pattern.base": "Invalid phone number" }),
    vehicleNumber: Joi.string().max(20).trim().uppercase().optional().allow(""),
    purpose: Joi.string().valid(...VISIT_PURPOSES).default("Guest"),
    note: Joi.string().max(300).trim().optional().allow(""),
    expectedAt: Joi.date().iso().min("now").optional().messages({
      "date.min": "Expected arrival time must be in the future",
    }),
  }),

  // Security logging a walk-in visitor
  logWalkIn: Joi.object({
    name: Joi.string().min(2).max(100).trim().required(),
    phone: Joi.string()
      .pattern(/^\+?[0-9]{7,15}$/)
      .optional()
      .messages({ "string.pattern.base": "Invalid phone number" }),
    vehicleNumber: Joi.string().max(20).trim().uppercase().optional().allow(""),
    purpose: Joi.string().valid(...VISIT_PURPOSES).default("Guest"),
    note: Joi.string().max(300).trim().optional().allow(""),
    // Optional — when omitted the walk-in is logged without resident notification
    hostId: Joi.string().hex().length(24).optional().messages({
      "string.length": "hostId must be a valid MongoDB ObjectId",
    }),
  }),

  // Security verifying OTP at gate
  verifyOTP: Joi.object({
    otp: Joi.string()
      .length(6)
      .pattern(/^\d{6}$/)
      .required()
      .messages({
        "string.length": "OTP must be exactly 6 digits",
        "string.pattern.base": "OTP must contain only digits",
      }),
  }),
};

// ─── Maintenance Validators ────────────────────────────────────────────────────
const maintenance = {

  createBill: Joi.object({
    title: Joi.string().min(3).max(150).trim().required(),
    description: Joi.string().max(1000).trim().optional().allow(""),
    billMonth: Joi.string()
      .pattern(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional()
      .messages({ "string.pattern.base": "billMonth must be in YYYY-MM format (e.g. 2025-01)" }),
    baseAmount: Joi.number().min(1).required().messages({
      "number.min": "Amount must be at least ₹1",
    }),
    dueDate: Joi.date().iso().min("now").required().messages({
      "date.min": "Due date must be in the future",
    }),
    penaltyEnabled: Joi.boolean().default(false),
    penaltyAmount: Joi.when("penaltyEnabled", {
      is: true,
      then: Joi.number().min(1).required().messages({
        "number.min": "Penalty amount must be at least ₹1",
        "any.required": "penaltyAmount is required when penaltyEnabled is true",
      }),
      otherwise: Joi.number().default(0),
    }),
    targetMode: Joi.string().valid("all", "specific").default("all"),
    targetFlats: Joi.when("targetMode", {
      is: "specific",
      then: Joi.array().items(Joi.string().trim()).min(1).required().messages({
        "array.min": "Specify at least one flat when targetMode is specific",
        "any.required": "targetFlats is required when targetMode is specific",
      }),
      otherwise: Joi.array().default([]),
    }),
  }),

  updateBill: Joi.object({
    title: Joi.string().min(3).max(150).trim(),
    description: Joi.string().max(1000).trim().allow(""),
    billMonth: Joi.string().pattern(/^\d{4}-(0[1-9]|1[0-2])$/),
    baseAmount: Joi.number().min(1),
    dueDate: Joi.date().iso(),
    penaltyEnabled: Joi.boolean(),
    penaltyAmount: Joi.number().min(0),
    targetMode: Joi.string().valid("all", "specific"),
    targetFlats: Joi.array().items(Joi.string().trim()),
  }).min(1),

  recordPayment: Joi.object({
    paidAmount: Joi.number().min(0).optional(),
    paymentMethod: Joi.string()
      .valid("cash", "upi", "neft", "cheque", "other")
      .required(),
    transactionId: Joi.string().max(100).trim().optional().allow(""),
    receiptNote: Joi.string().max(300).trim().optional().allow(""),
  }),

  applyDiscount: Joi.object({
    discount: Joi.number().min(0).required().messages({
      "any.required": "discount amount is required",
      "number.min": "Discount cannot be negative",
    }),
  }),
};


// ─── Amenity Validators ────────────────────────────────────────────────────────
const { AMENITY_CATEGORIES } = require("../models/amenity.model");

const amenity = {

  createAmenity: Joi.object({
    name:                   Joi.string().min(2).max(100).trim().required(),
    category:               Joi.string().valid(...AMENITY_CATEGORIES).default("Other"),
    description:            Joi.string().max(1000).trim().optional().allow(""),
    maxConcurrentBookings:  Joi.number().integer().min(1).default(1),
    slotDurationOptions:    Joi.array().items(Joi.number().integer().min(15)).min(1).default([60]),
    maxSlotDuration:        Joi.number().integer().min(15).default(120),
    advanceBookingDays:     Joi.number().integer().min(1).max(90).default(7),
    openTime:               Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).default("06:00"),
    closeTime:              Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).default("22:00"),
    closedDays:             Joi.array().items(Joi.number().integer().min(0).max(6)).default([]),
    requiresApproval:       Joi.boolean().default(false),
    depositAmount:          Joi.number().min(0).default(0),
    rules:                  Joi.string().max(2000).trim().optional().allow(""),
  }),

  updateAmenity: Joi.object({
    name:                   Joi.string().min(2).max(100).trim(),
    category:               Joi.string().valid(...AMENITY_CATEGORIES),
    description:            Joi.string().max(1000).trim().allow(""),
    maxConcurrentBookings:  Joi.number().integer().min(1),
    slotDurationOptions:    Joi.array().items(Joi.number().integer().min(15)).min(1),
    maxSlotDuration:        Joi.number().integer().min(15),
    advanceBookingDays:     Joi.number().integer().min(1).max(90),
    openTime:               Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/),
    closeTime:              Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/),
    closedDays:             Joi.array().items(Joi.number().integer().min(0).max(6)),
    requiresApproval:       Joi.boolean(),
    depositAmount:          Joi.number().min(0),
    rules:                  Joi.string().max(2000).trim().allow(""),
    isActive:               Joi.boolean(),
  }).min(1),

  createBooking: Joi.object({
    amenityId:   Joi.string().hex().length(24).required(),
    startTime:   Joi.date().iso().min("now").required().messages({ "date.min": "Start time must be in the future" }),
    endTime:     Joi.date().iso().greater(Joi.ref("startTime")).required().messages({ "date.greater": "End time must be after start time" }),
    purpose:     Joi.string().max(200).trim().optional().allow(""),
    guestCount:  Joi.number().integer().min(1).default(1),
  }),

  cancelBooking: Joi.object({
    reason: Joi.string().max(300).trim().optional().allow(""),
  }),

  reviewBooking: Joi.object({
    adminNote: Joi.string().max(500).trim().optional().allow(""),
  }),
};

// ─── Event Validators ──────────────────────────────────────────────────────────
const { EVENT_CATEGORIES, RSVP_STATUSES } = require("../models/event.model");

const event = {

  /**
   * Create event validator.
   *
   * FIELD MISMATCH FIX: the frontend EventsScreen sends eventDate / endDate /
   * maxAttendees / isAllDay.  The backend model stores startTime / endTime /
   * capacity / isAllDay.  The validator accepts EITHER name (Joi.alternatives)
   * so both old API clients and the frontend form work.  The service layer
   * (_normalizePayload) then maps the frontend names to model fields before
   * hitting MongoDB.
   */
  create: Joi.object({
    title:        Joi.string().min(3).max(150).trim().required(),
    description:  Joi.string().max(3000).trim().optional().allow(""),
    category:     Joi.string().valid(...EVENT_CATEGORIES).default("Other"),

    // Accept startTime OR eventDate (frontend alias)
    startTime: Joi.date().iso().min("now")
      .messages({ "date.min": "Event start must be in the future" }),
    eventDate: Joi.date().iso()
      .messages({ "date.min": "Event start must be in the future" }),

    // Accept endTime OR endDate (frontend alias)
    endTime:  Joi.date().iso(),
    endDate:  Joi.date().iso(),

    venue:        Joi.string().max(200).trim().optional().allow(""),
    isAllDay:     Joi.boolean().default(false),
    rsvpEnabled:  Joi.boolean().default(true),
    rsvpDeadline: Joi.date().iso().optional(),

    // Accept capacity OR maxAttendees (frontend alias)
    capacity:     Joi.number().integer().min(1).optional(),
    maxAttendees: Joi.number().integer().min(1).optional(),

    // frontend sends rules but model uses description; strip silently in service
    rules: Joi.string().max(2000).trim().optional().allow(""),
  }).or("startTime", "eventDate"),  // at least one date field is required

  update: Joi.object({
    title:        Joi.string().min(3).max(150).trim(),
    description:  Joi.string().max(3000).trim().allow(""),
    category:     Joi.string().valid(...EVENT_CATEGORIES),
    startTime:    Joi.date().iso(),
    eventDate:    Joi.date().iso(),
    endTime:      Joi.date().iso(),
    endDate:      Joi.date().iso(),
    venue:        Joi.string().max(200).trim().allow(""),
    isAllDay:     Joi.boolean(),
    rsvpEnabled:  Joi.boolean(),
    rsvpDeadline: Joi.date().iso(),
    capacity:     Joi.number().integer().min(1),
    maxAttendees: Joi.number().integer().min(1),
    rules:        Joi.string().max(2000).trim().allow(""),
  }).min(1),

  cancel: Joi.object({
    reason: Joi.string().max(300).trim().optional().allow(""),
  }),

  rsvp: Joi.object({
    status:     Joi.string().valid(...RSVP_STATUSES).required(),
    guestCount: Joi.number().integer().min(0).max(10).default(0),
    note:       Joi.string().max(200).trim().optional().allow(""),
  }),
};

// ─── Parking Validators ────────────────────────────────────────────────────────
const { SLOT_TYPES } = require("../models/parking.model");

const vehicleNumberPattern = /^[A-Z0-9\s\-]{2,20}$/;

const parking = {

  createSlot: Joi.object({
    slotNumber:   Joi.string().max(20).trim().uppercase().required(),
    zone:         Joi.string().max(50).trim().optional().allow(""),
    type:         Joi.string().valid(...SLOT_TYPES).required(),
    note:         Joi.string().max(300).trim().optional().allow(""),
  }),

  // Accepts two formats:
  //   Mobile:  { slots: [{slotNumber, type, zone?}] }   (pre-generated list)
  //   Web/legacy: { type, count, prefix?, startNumber?, zone? }
  bulkCreateSlots: Joi.alternatives().try(
    Joi.object({
      slots: Joi.array()
        .items(Joi.object({
          slotNumber: Joi.string().min(1).max(20).trim().required(),
          type:       Joi.string().valid(...SLOT_TYPES).required(),
          zone:       Joi.string().max(50).trim().allow("").optional(),
        }))
        .min(1)
        .max(200)
        .required(),
    }),
    Joi.object({
      type:        Joi.string().valid(...SLOT_TYPES).required(),
      count:       Joi.number().integer().min(1).max(200).required(),
      zone:        Joi.string().max(50).trim().optional().allow(""),
      prefix:      Joi.string().max(5).trim().uppercase().optional().allow(""),
      startNumber: Joi.number().integer().min(1).default(1),
    })
  ),

  updateSlot: Joi.object({
    zone:          Joi.string().max(50).trim().allow(""),
    type:          Joi.string().valid(...SLOT_TYPES),
    status:        Joi.string().valid("available", "blocked"),
    vehicleNumber: Joi.string().pattern(vehicleNumberPattern).uppercase().allow(""),
    note:          Joi.string().max(300).trim().allow(""),
    isActive:      Joi.boolean(),
  }).min(1),

  submitRequest: Joi.object({
    slotType:           Joi.string().valid(...SLOT_TYPES).required(),
    vehicleNumber:      Joi.string().pattern(vehicleNumberPattern).uppercase().required().messages({
      "string.pattern.base": "Invalid vehicle number format",
    }),
    vehicleDescription: Joi.string().max(200).trim().optional().allow(""),
    note:               Joi.string().max(300).trim().optional().allow(""),
  }),

  approveRequest: Joi.object({
    slotId: Joi.string().hex().length(24).optional(),
  }),

  rejectRequest: Joi.object({
    adminNote: Joi.string().max(300).trim().optional().allow(""),
  }),
};

// Re-export everything including the new validators
module.exports = { visitor, maintenance, amenity, event, parking };
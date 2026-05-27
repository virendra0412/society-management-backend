const mongoose = require("mongoose");

/**
 * Amenity Booking
 *
 * Two collections:
 *   Amenity  — defines a bookable resource (Clubhouse, Pool, Gym, etc.)
 *              Admin manages these. Each amenity has slot rules (duration,
 *              max concurrent bookings, operating hours, blocked days).
 *
 *   AmenityBooking — one document per booking request.
 *              Status flow: pending → confirmed → cancelled / completed
 *
 * Conflict-check logic (in repository):
 *   A new booking [startTime, endTime] conflicts with an existing one if:
 *     existing.startTime < newEndTime  AND  existing.endTime > newStartTime
 *   We only count bookings with status "confirmed" or "pending" against the
 *   amenity's maxConcurrentBookings limit.
 */

// ─── AMENITY ─────────────────────────────────────────────────────────────────

const AMENITY_CATEGORIES = Object.freeze([
  "Clubhouse",
  "Swimming Pool",
  "Gym",
  "Tennis Court",
  "Badminton Court",
  "Party Hall",
  "Terrace",
  "Kids Play Area",
  "Other",
]);

const amenitySchema = new mongoose.Schema(
  {
    society: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Society",
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ── Identity ──────────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, "Amenity name is required"],
      trim: true,
      maxlength: [100, "Name too long"],
    },
    category: {
      type: String,
      enum: { values: AMENITY_CATEGORIES, message: "Invalid category" },
      default: "Other",
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description too long"],
      default: null,
    },
    images: {
      type: [String], // Cloudinary URLs
      default: [],
      validate: [arr => arr.length <= 5, "Maximum 5 images per amenity"],
    },

    // ── Booking Rules ─────────────────────────────────────────────────────────
    // Max simultaneous bookings allowed in the same time window
    maxConcurrentBookings: {
      type: Number,
      default: 1,
      min: [1, "Must allow at least 1 concurrent booking"],
    },
    // Slot duration options in minutes that residents can choose from
    // e.g. [60, 120] means 1-hour or 2-hour slots
    slotDurationOptions: {
      type: [Number],
      default: [60],
      validate: [arr => arr.length > 0, "Must have at least one slot duration option"],
    },
    // Max slot duration a resident can book at once (minutes)
    maxSlotDuration: {
      type: Number,
      default: 120,
      min: [15, "Minimum slot duration is 15 minutes"],
    },
    // Max days in advance a resident can book
    advanceBookingDays: {
      type: Number,
      default: 7,
    },

    // ── Operating Hours ───────────────────────────────────────────────────────
    // "06:00" – "22:00" format (HH:mm, 24-hour)
    openTime: {
      type: String,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, "openTime must be HH:mm (e.g. 06:00)"],
      default: "06:00",
    },
    closeTime: {
      type: String,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, "closeTime must be HH:mm (e.g. 22:00)"],
      default: "22:00",
    },
    // Days of week when amenity is CLOSED (0=Sun, 1=Mon, …, 6=Sat)
    closedDays: {
      type: [Number],
      default: [],
      validate: [
        arr => arr.every(d => d >= 0 && d <= 6),
        "closedDays values must be 0–6",
      ],
    },

    // ── Admin-level rules ─────────────────────────────────────────────────────
    requiresApproval: {
      // If true, admin must confirm each booking (status stays "pending" until then)
      type: Boolean,
      default: false,
    },
    depositAmount: {
      // Optional refundable deposit in ₹
      type: Number,
      default: 0,
      min: 0,
    },
    rules: {
      // Free-text house rules shown to resident before booking
      type: String,
      trim: true,
      maxlength: [2000, "Rules text too long"],
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

amenitySchema.index({ society: 1, isActive: 1 });

// ─── AMENITY BOOKING ─────────────────────────────────────────────────────────

const BOOKING_STATUSES = Object.freeze([
  "pending",    // submitted, awaiting admin confirmation (when requiresApproval=true)
  "confirmed",  // admin approved or auto-confirmed
  "cancelled",  // cancelled by resident or admin
  "completed",  // slot time has passed
  "rejected",   // admin rejected the booking request
]);

const amenityBookingSchema = new mongoose.Schema(
  {
    amenity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Amenity",
      required: true,
      index: true,
    },
    society: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Society",
      required: true,
      index: true,
    },
    bookedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ── Slot ─────────────────────────────────────────────────────────────────
    startTime: {
      type: Date,
      required: [true, "Start time is required"],
    },
    endTime: {
      type: Date,
      required: [true, "End time is required"],
    },
    // Duration stored redundantly for fast queries / display
    durationMinutes: {
      type: Number,
    },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: { values: BOOKING_STATUSES, message: "Invalid booking status" },
      default: "pending",
      index: true,
    },

    // ── Optional fields ───────────────────────────────────────────────────────
    purpose: {
      type: String,
      trim: true,
      maxlength: [200, "Purpose too long"],
      default: null,
    },
    guestCount: {
      type: Number,
      default: 1,
      min: [1, "Guest count must be at least 1"],
    },
    adminNote: {
      // Admin fills this when confirming/rejecting
      type: String,
      trim: true,
      maxlength: [500, "Note too long"],
      default: null,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cancelReason: {
      type: String,
      trim: true,
      maxlength: [300, "Reason too long"],
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Core conflict-check index: find overlapping bookings fast
amenityBookingSchema.index({ amenity: 1, status: 1, startTime: 1, endTime: 1 });
amenityBookingSchema.index({ society: 1, bookedBy: 1, createdAt: -1 });
amenityBookingSchema.index({ society: 1, status: 1, startTime: 1 });

// ─── Pre-save: compute durationMinutes ───────────────────────────────────────
amenityBookingSchema.pre("save", function (next) {
  if (this.startTime && this.endTime) {
    this.durationMinutes = Math.round((this.endTime - this.startTime) / 60000);
  }
  next();
});

// ─── Virtual ─────────────────────────────────────────────────────────────────
amenityBookingSchema.virtual("isUpcoming").get(function () {
  return this.status === "confirmed" && this.startTime > new Date();
});

const Amenity = mongoose.model("Amenity", amenitySchema);
const AmenityBooking = mongoose.model("AmenityBooking", amenityBookingSchema);

module.exports = { Amenity, AmenityBooking, AMENITY_CATEGORIES, BOOKING_STATUSES };

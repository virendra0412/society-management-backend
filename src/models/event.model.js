const mongoose = require("mongoose");

/**
 * Society Events + RSVP
 *
 * Flow:
 *   1. Admin creates an event (title, date, venue, capacity, optional RSVP deadline)
 *   2. Residents RSVP with status "going" | "not_going" | "maybe"
 *   3. Admin can see the full attendee list; residents see the count
 *   4. Admin cancels / closes RSVP when deadline passes
 *   5. A cron job sends a reminder notification 24h before the event
 *
 * RSVP is stored as a sub-array on the Event document.
 * Each resident can have at most one RSVP entry (upsert pattern).
 */

const EVENT_CATEGORIES = Object.freeze([
  "Cultural",
  "Sports",
  "Meeting",
  "Festival",
  "Workshop",
  "Health",
  "Other",
]);

const RSVP_STATUSES = Object.freeze(["going", "not_going", "maybe"]);

// ─── RSVP Sub-document ─────────────────────────────────────────────────────────
const rsvpSchema = new mongoose.Schema(
  {
    resident: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: { values: RSVP_STATUSES, message: "Invalid RSVP status" },
      required: true,
    },
    guestCount: {
      // How many extra guests they're bringing (0 = just themselves)
      type: Number,
      default: 0,
      min: [0, "Guest count cannot be negative"],
      max: [10, "Maximum 10 additional guests"],
    },
    note: {
      type: String,
      trim: true,
      maxlength: [200, "Note too long"],
      default: null,
    },
    respondedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true, timestamps: false }
);

// ─── Event Schema ─────────────────────────────────────────────────────────────
const eventSchema = new mongoose.Schema(
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
    title: {
      type: String,
      required: [true, "Event title is required"],
      trim: true,
      maxlength: [150, "Title too long"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [3000, "Description too long"],
      default: null,
    },
    category: {
      type: String,
      enum: { values: EVENT_CATEGORIES, message: "Invalid category" },
      default: "Other",
    },
    bannerImage: {
      type: String, // Cloudinary URL
      default: null,
    },

    // ── Timing & Venue ────────────────────────────────────────────────────────
    startTime: {
      type: Date,
      required: [true, "Event start time is required"],
    },
    endTime: {
      type: Date,
      required: [true, "Event end time is required"],
    },
    venue: {
      type: String,
      trim: true,
      maxlength: [200, "Venue too long"],
      default: null,
    },

    // ── RSVP Settings ─────────────────────────────────────────────────────────
    rsvpEnabled: {
      type: Boolean,
      default: true,
    },
    rsvpDeadline: {
      // RSVP closes at this time; null = RSVP allowed until event starts
      type: Date,
      default: null,
    },
    capacity: {
      // Max "going" headcount (residents + their guests). null = unlimited
      type: Number,
      default: null,
      min: [1, "Capacity must be at least 1"],
    },

    // ── State ─────────────────────────────────────────────────────────────────
    isPublished: {
      type: Boolean,
      default: false,
    },
    isCancelled: {
      type: Boolean,
      default: false,
    },
    cancelReason: {
      type: String,
      trim: true,
      maxlength: [300, "Reason too long"],
      default: null,
    },
    // Reminder notification sent flag (set by cron job)
    reminderSent: {
      type: Boolean,
      default: false,
      select: false,
    },

    // ── RSVPs ─────────────────────────────────────────────────────────────────
    rsvps: {
      type: [rsvpSchema],
      default: [],
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
eventSchema.index({ society: 1, startTime: 1, isPublished: 1 });
eventSchema.index({ society: 1, isCancelled: 1 });
// For the reminder job
eventSchema.index({
  isPublished: 1,
  isCancelled: 1,
  reminderSent: 1,
  startTime: 1,
});

// ─── Virtuals ─────────────────────────────────────────────────────────────────
eventSchema.virtual("goingCount").get(function () {
  return this.rsvps
    .filter(r => r.status === "going")
    .reduce((sum, r) => sum + 1 + (r.guestCount || 0), 0);
});

eventSchema.virtual("rsvpCounts").get(function () {
  return {
    going:     this.rsvps.filter(r => r.status === "going").length,
    not_going: this.rsvps.filter(r => r.status === "not_going").length,
    maybe:     this.rsvps.filter(r => r.status === "maybe").length,
    total:     this.rsvps.length,
  };
});

eventSchema.virtual("isRsvpOpen").get(function () {
  if (!this.rsvpEnabled) return false;
  if (this.isCancelled) return false;
  if (this.rsvpDeadline && new Date() > this.rsvpDeadline) return false;
  if (new Date() > this.startTime) return false;
  return true;
});

const Event = mongoose.model("Event", eventSchema);

module.exports = { Event, EVENT_CATEGORIES, RSVP_STATUSES };

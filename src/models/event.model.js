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
    // FIX: frontend sends isAllDay — store it so it round-trips correctly
    isAllDay: {
      type: Boolean,
      default: false,
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

// Ensure legacy or partially hydrated event docs always have an RSVP array.
// This prevents virtual getters from failing when `rsvps` is absent in the DB.
eventSchema.pre("init", function (doc) {
  if (!doc.rsvps) {
    doc.rsvps = [];
  }
});

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
//
// BUG FIX: the event repository used .select("-rsvps") in list queries.
// Mongoose does NOT initialise excluded fields from schema defaults, so
// `this.rsvps` was `undefined`. All three virtuals below called .filter()/.reduce()
// on it → TypeError → 500 on every list request that returned ≥1 document.
//
// Fix A: guard each virtual with `|| []`.
// Fix B: remove .select("-rsvps") in the repository (done in event.repository.js)
//        so the virtuals always have data to work with.
//
// FIELD MISMATCH FIX: the frontend uses different field names than the backend
// model (eventDate vs startTime, endDate vs endTime, maxAttendees vs capacity,
// rsvpSummary vs rsvpCounts). Alias virtuals below let the backend return both
// names so the frontend works without modification.
//

eventSchema.virtual("goingCount").get(function () {
  return (this.rsvps || [])
    .filter(r => r.status === "going")
    .reduce((sum, r) => sum + 1 + (r.guestCount || 0), 0);
});

eventSchema.virtual("rsvpCounts").get(function () {
  const rsvps = this.rsvps || [];
  return {
    going:     rsvps.filter(r => r.status === "going").length,
    not_going: rsvps.filter(r => r.status === "not_going").length,
    maybe:     rsvps.filter(r => r.status === "maybe").length,
    total:     rsvps.length,
  };
});

eventSchema.virtual("isRsvpOpen").get(function () {
  if (!this.rsvpEnabled) return false;
  if (this.isCancelled) return false;
  if (this.rsvpDeadline && new Date() > this.rsvpDeadline) return false;
  if (new Date() > this.startTime) return false;
  return true;
});

// ── Frontend compatibility aliases ────────────────────────────────────────────
// The frontend EventsScreen reads event.eventDate / event.endDate /
// event.maxAttendees / event.rsvpSummary.  These virtuals expose the backend
// model fields under those names so both old and new code works without a
// frontend deploy.

/** Alias for startTime — consumed by EventsScreen date display helpers. */
eventSchema.virtual("eventDate").get(function () {
  return this.startTime;
});

/** Alias for endTime — consumed by EventsScreen "Ends" detail row. */
eventSchema.virtual("endDate").get(function () {
  return this.endTime;
});

/** Alias for capacity — consumed by EventsScreen capacity badge. */
eventSchema.virtual("maxAttendees").get(function () {
  return this.capacity;
});

/**
 * Alias for rsvpCounts — consumed by EventsScreen RsvpCounts component
 * and the isFull capacity check.
 */
eventSchema.virtual("rsvpSummary").get(function () {
  return this.rsvpCounts;
});

const Event = mongoose.model("Event", eventSchema);

module.exports = { Event, EVENT_CATEGORIES, RSVP_STATUSES };

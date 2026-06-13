/**
 * models/auditLog.model.js
 *
 * Immutable audit trail for all significant write actions in the platform.
 *
 * Schema: { userId, societyId, action, entity, entityId, changes, ip, timestamp }
 *
 * Design decisions:
 *  - No `updatedAt` — logs are append-only and never modified.
 *  - `changes` is a free-form Mixed field so callers can store whatever
 *    before/after snapshot is relevant without a rigid schema.
 *  - Indexes support the two main query patterns:
 *      (a) "show me all actions in society X, newest first" — admin audit panel
 *      (b) "show me what user Y did" — SA investigation
 *  - TTL index (90 days) is intentionally NOT set here.
 *    Retention is handled by the Cron Job in Task 3 so the SA can
 *    configure per-society retention. Auto-expiry on DB level would
 *    bypass that flexibility.
 */

const mongoose = require("mongoose");

// ─── Allowed action names (single source of truth) ────────────────────────────
// Keep this list exhaustive. The middleware validates against it so a typo
// in a call-site fails loudly rather than silently inserting garbage.
const AUDIT_ACTIONS = Object.freeze([
  // ── Resident lifecycle ────────────────────────────────────────────────────
  "member.approved",
  "member.rejected",

  // ── Visitor ───────────────────────────────────────────────────────────────
  "visitor.invite_created",
  "visitor.invite_cancelled",
  "visitor.walkin_logged",
  "visitor.walkin_approved",
  "visitor.walkin_rejected",
  "visitor.otp_verified",
  "visitor.exited",
  "visitor.trusted_registered",
  "visitor.trusted_revoked",

  // ── Maintenance ───────────────────────────────────────────────────────────
  "maintenance.bill_created",
  "maintenance.bill_published",
  "maintenance.bill_updated",
  "maintenance.bill_closed",
  "maintenance.bill_deleted",
  "maintenance.payment_recorded",
  "maintenance.penalty_applied",
  "maintenance.discount_applied",

  // ── Notices ───────────────────────────────────────────────────────────────
  "notice.published",
  "notice.updated",
  "notice.deleted",
  "notice.pinned",
  "notice.unpinned",

  // Issues
  "issue.created",
  "issue.updated",
  "issue.status_updated",
  "issue.assigned",
  "issue.closed",
  "issue.escalated",
  "issue.comment_added",
  "issue.photo_uploaded",
  "issue.vendor_assigned",

  // Amenities
  "amenity.created",
  "amenity.updated",
  "amenity.deactivated",
  "amenity.booked",
  "amenity.booking_created",
  "amenity.booking_cancelled",
  "amenity.booking_confirmed",
  "amenity.booking_rejected",

  // Parking
  "parking.slot_created",
  "parking.slot_updated",
  "parking.slot_deleted",
  "parking.slot_assigned",
  "parking.slot_released",
  "parking.request_created",
  "parking.request_approved",
  "parking.request_rejected",

  // Events
  "event.created",
  "event.updated",
  "event.deleted",
  "event.cancelled",
  "event.rsvp_created",
  "event.rsvp_updated",

  // Polls
  "poll.created",
  "poll.updated",
  "poll.closed",
  "poll.vote_cast",

  // Admin
  "admin.member_removed",
  "admin.role_changed",
]);

const auditLogSchema = new mongoose.Schema(
  {
    // Who performed the action (null for system-triggered actions from cron jobs)
    userId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
      index:   true,
    },

    // Which society this action belongs to
    societyId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Society",
      required: [true, "societyId is required on audit logs"],
      index:    true,
    },

    // Machine-readable action name — one of AUDIT_ACTIONS
    action: {
      type:     String,
      required: [true, "action is required"],
      enum: {
        values:  AUDIT_ACTIONS,
        message: "Unknown audit action: {VALUE}",
      },
      index: true,
    },

    // Which collection was affected (e.g. "Visitor", "MaintenanceBill", "Notice", "User")
    entity: {
      type:     String,
      required: [true, "entity is required"],
      trim:     true,
    },

    // The _id of the affected document
    entityId: {
      type:    mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // Optional before/after snapshot or relevant metadata
    // Keep small — this is NOT a full document backup, just the changed fields.
    // Example: { before: { status: "pending" }, after: { status: "approved" } }
    changes: {
      type:    mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Caller's IP address (from req.ip, respects trust proxy setting)
    ip: {
      type:    String,
      default: null,
      trim:    true,
    },

    // Explicit timestamp — set by the middleware, not relying on MongoDB default,
    // so the value is available synchronously before the DB write resolves.
    timestamp: {
      type:    Date,
      default: Date.now,
      index:   true,
    },
  },
  {
    // No updatedAt — logs are immutable.
    timestamps: false,
    // Omit __v from all queries.
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ─── Compound indexes ─────────────────────────────────────────────────────────

// Admin audit panel: "show all actions in this society, newest first"
auditLogSchema.index({ societyId: 1, timestamp: -1 });

// SA investigation: "show everything a specific user did"
auditLogSchema.index({ userId: 1, timestamp: -1 });

// Filter by action type within a society
auditLogSchema.index({ societyId: 1, action: 1, timestamp: -1 });

// ─── Prevent accidental updates ───────────────────────────────────────────────
auditLogSchema.pre("findOneAndUpdate", function () {
  throw new Error("AuditLog documents are immutable — use insertOne/create only.");
});
auditLogSchema.pre("updateOne", function () {
  throw new Error("AuditLog documents are immutable — use insertOne/create only.");
});
auditLogSchema.pre("updateMany", function () {
  throw new Error("AuditLog documents are immutable — use insertOne/create only.");
});

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

module.exports = AuditLog;
module.exports.AUDIT_ACTIONS = AUDIT_ACTIONS;

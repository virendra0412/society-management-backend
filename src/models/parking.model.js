const mongoose = require("mongoose");

/**
 * Parking Management
 *
 * Two collections:
 *
 *   ParkingSlot  — represents one physical parking spot in the society.
 *                  Admin creates and manages all slots.
 *                  Each slot has a slotNumber, zone, type (2W/4W/EV), and
 *                  a current assignedTo resident (null = available).
 *
 *   ParkingRequest — resident submits a request for a permanent slot.
 *                    Admin assigns an available slot → that slot's assignedTo
 *                    is set and status becomes "assigned".
 *
 * Design decisions:
 *   - "Visitor parking" is handled by the Visitor model (vehicleNumber field).
 *     If a dedicated visitor bay tracking is needed, it can use ParkingSlot
 *     with type "Visitor".
 *   - One resident can hold multiple slots (e.g. 2W + 4W).
 *   - Slot numbers are unique within a society.
 */

const SLOT_TYPES   = Object.freeze(["2W", "4W", "EV", "Visitor", "Reserved"]);
const SLOT_STATUSES = Object.freeze(["available", "assigned", "blocked"]);
const REQUEST_STATUSES = Object.freeze(["pending", "approved", "rejected", "cancelled"]);

// ─── PARKING SLOT ─────────────────────────────────────────────────────────────

const parkingSlotSchema = new mongoose.Schema(
  {
    society: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Society",
      required: true,
      index: true,
    },

    // ── Slot Identity ─────────────────────────────────────────────────────────
    slotNumber: {
      // e.g. "A-101", "B-12", "GF-05"
      type: String,
      required: [true, "Slot number is required"],
      trim: true,
      uppercase: true,
      maxlength: [20, "Slot number too long"],
    },
    zone: {
      // e.g. "Basement", "Ground Floor", "Open"
      type: String,
      trim: true,
      maxlength: [50, "Zone name too long"],
      default: null,
    },
    type: {
      type: String,
      enum: { values: SLOT_TYPES, message: "Invalid slot type" },
      required: true,
    },

    // ── Assignment ────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: { values: SLOT_STATUSES, message: "Invalid status" },
      default: "available",
      index: true,
    },
    assignedTo: {
      // Resident currently using this slot
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedFlat: {
      type: String,
      trim: true,
      default: null,
    },
    vehicleNumber: {
      // Vehicle registered to this slot
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [20, "Vehicle number too long"],
      default: null,
    },
    assignedAt: {
      type: Date,
      default: null,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ── Admin notes ───────────────────────────────────────────────────────────
    note: {
      type: String,
      trim: true,
      maxlength: [300, "Note too long"],
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
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

// Slot number is unique per society
parkingSlotSchema.index({ society: 1, slotNumber: 1 }, { unique: true });
parkingSlotSchema.index({ society: 1, status: 1, type: 1 });
parkingSlotSchema.index({ society: 1, assignedTo: 1 });

// ─── PARKING REQUEST ─────────────────────────────────────────────────────────

const parkingRequestSchema = new mongoose.Schema(
  {
    society: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Society",
      required: true,
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    flat: {
      type: String,
      trim: true,
    },

    // ── Request Details ───────────────────────────────────────────────────────
    slotType: {
      type: String,
      enum: { values: SLOT_TYPES, message: "Invalid slot type" },
      required: [true, "Slot type is required"],
    },
    vehicleNumber: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [20, "Vehicle number too long"],
      required: [true, "Vehicle number is required"],
    },
    vehicleDescription: {
      // e.g. "Red Honda Activa", "White Maruti Swift"
      type: String,
      trim: true,
      maxlength: [200, "Description too long"],
      default: null,
    },
    note: {
      type: String,
      trim: true,
      maxlength: [300, "Note too long"],
      default: null,
    },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: { values: REQUEST_STATUSES, message: "Invalid status" },
      default: "pending",
      index: true,
    },

    // ── Resolution (filled by admin) ──────────────────────────────────────────
    assignedSlot: {
      // Which physical slot was assigned
      type: mongoose.Schema.Types.ObjectId,
      ref: "ParkingSlot",
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    adminNote: {
      type: String,
      trim: true,
      maxlength: [300, "Note too long"],
      default: null,
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

parkingRequestSchema.index({ society: 1, status: 1, createdAt: -1 });
parkingRequestSchema.index({ requestedBy: 1, status: 1 });

const ParkingSlot    = mongoose.model("ParkingSlot", parkingSlotSchema);
const ParkingRequest = mongoose.model("ParkingRequest", parkingRequestSchema);

module.exports = { ParkingSlot, ParkingRequest, SLOT_TYPES, SLOT_STATUSES, REQUEST_STATUSES };

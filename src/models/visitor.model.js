const mongoose = require("mongoose");
const crypto = require("crypto");

/**
 * Visitor Management
 *
 * Flow A — Pre-approved Invite (resident invites a guest):
 *   1. Resident creates an invite  → status: "invited"
 *   2. System generates a 6-digit entry OTP (hashed in DB)
 *   3. Resident shares OTP with visitor (out-of-band: WhatsApp, SMS, etc.)
 *   4. Visitor arrives → security enters OTP → status: "approved", entryTime recorded
 *   5. Visitor leaves  → security marks exit → status: "exited",  exitTime  recorded
 *
 * Flow B — Walk-in (visitor arrives without prior invite):
 *   1. Security creates a walk-in entry → status: "pending"
 *   2. Security calls resident for approval
 *   3. Resident approves/rejects via app → status: "approved" / "rejected"
 *   4. Visitor leaves → security marks exit → status: "exited"
 */

const VISITOR_STATUSES = Object.freeze([
  "invited",   // resident created invite, OTP generated
  "pending",   // walk-in, awaiting resident approval
  "approved",  // entry approved (OTP verified OR resident approved walk-in)
  "rejected",  // resident rejected walk-in
  "exited",    // visitor has left the premises
  "expired",   // OTP expired without entry
]);

const VISIT_PURPOSES = Object.freeze([
  "Guest",
  "Delivery",
  "Cab",
  "Service",
  "Other",
]);

const visitorSchema = new mongoose.Schema(
  {
    // ── Visitor Info ──────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, "Visitor name is required"],
      trim: true,
      maxlength: [100, "Visitor name too long"],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[0-9]{7,15}$/, "Invalid phone number"],
      default: null,
    },
    vehicleNumber: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [20, "Vehicle number too long"],
      default: null,
    },

    // ── Visit Context ─────────────────────────────────────────────────────────
    purpose: {
      type: String,
      enum: { values: VISIT_PURPOSES, message: "Invalid purpose" },
      default: "Guest",
    },
    note: {
      type: String,
      trim: true,
      maxlength: [300, "Note too long"],
      default: null,
    },

    // ── Resident & Society ────────────────────────────────────────────────────
    society: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Society",
      required: true,
      index: true,
    },
    host: {
      // The resident being visited
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    hostFlat: {
      type: String,
      trim: true,
    },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: { values: VISITOR_STATUSES, message: "Invalid status" },
      default: "invited",
      index: true,
    },

    // ── OTP (Flow A — pre-approved invite) ────────────────────────────────────
    // Raw OTP is NEVER stored. We store only a SHA-256 hash.
    // The plaintext OTP is returned once at invite creation for the resident to share.
    entryOTPHash: {
      type: String,
      select: false,
      default: null,
    },
    entryOTPExpires: {
      type: Date,
      default: null,
    },

    // ── Walk-in (Flow B) ──────────────────────────────────────────────────────
    isWalkIn: {
      type: Boolean,
      default: false,
    },
    // Security guard who logged the walk-in
    loggedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ── Timestamps ────────────────────────────────────────────────────────────
    // When the visitor is expected (for pre-approved invites)
    expectedAt: {
      type: Date,
      default: null,
    },
    entryTime: {
      type: Date,
      default: null,
    },
    exitTime: {
      type: Date,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    // Who approved (could be the resident or the security guard after OTP verify)
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.entryOTPHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ─── Compound Indexes ──────────────────────────────────────────────────────────
visitorSchema.index({ society: 1, status: 1, createdAt: -1 });
visitorSchema.index({ society: 1, host: 1, createdAt: -1 });
visitorSchema.index({ entryOTPExpires: 1 }, { sparse: true }); // TTL-like queries for expiry

// ─── Instance Methods ─────────────────────────────────────────────────────────

/**
 * Generate a 6-digit entry OTP.
 * Stores SHA-256 hash in entryOTPHash; returns the plaintext OTP.
 * OTP expires in `expiryMinutes` minutes (default 24 h for pre-invites).
 */
visitorSchema.methods.generateOTP = function (expiryMinutes = 1440) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.entryOTPHash = crypto.createHash("sha256").update(otp).digest("hex");
  this.entryOTPExpires = new Date(Date.now() + expiryMinutes * 60 * 1000);
  return otp; // Return plaintext — show once, never stored raw
};

/**
 * Verify a candidate OTP against the stored hash.
 * Returns true if valid and not expired.
 */
visitorSchema.methods.verifyOTP = function (candidateOTP) {
  if (!this.entryOTPHash || !this.entryOTPExpires) return false;
  if (new Date() > this.entryOTPExpires) return false;
  const hash = crypto.createHash("sha256").update(candidateOTP.toString()).digest("hex");
  return hash === this.entryOTPHash;
};

const Visitor = mongoose.model("Visitor", visitorSchema);

module.exports = Visitor;
module.exports.VISITOR_STATUSES = VISITOR_STATUSES;
module.exports.VISIT_PURPOSES = VISIT_PURPOSES;

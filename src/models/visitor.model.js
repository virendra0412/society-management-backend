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
 *
 * Flow C — Frequent / Trusted Visitor (maids, cooks, drivers, etc.):
 *   1. Resident registers a trusted visitor with schedule + validity
 *   2. Guard looks up visitor by phone or name → system checks schedule window
 *   3. Auto-approved if within window → entry logged silently (no push per visit)
 *   4. Resident gets a daily digest instead of per-entry notifications
 *
 * Flow D — Delivery (Amazon, Swiggy, Zepto, etc.):
 *   Uses existing walk-in flow with purpose:"Delivery".
 *   Auto-exit fires after a configurable timeout (default 15 min) via cron job.
 */

const VISITOR_STATUSES = Object.freeze([
  "invited",   // resident created invite, OTP generated
  "pending",   // walk-in, awaiting resident approval
  "approved",  // entry approved (OTP verified OR resident approved walk-in OR trusted auto-entry)
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

// Trusted visitor categories (Flow C)
const TRUSTED_VISITOR_CATEGORIES = Object.freeze([
  "Maid",
  "Cook",
  "Driver",
  "Security",
  "Vendor",
  "Delivery",
  "Service",
  "Other",
]);

// Valid pass durations for trusted visitors
const TRUSTED_PASS_TYPES = Object.freeze([
  "daily",     // expires midnight — for one-time delivery/cab
  "monthly",   // 30 days — maids, cooks
  "permanent", // until manually revoked by resident
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

    // ── Flow C: Trusted / Frequent Visitor ────────────────────────────────────
    /**
     * When true this record represents a standing pass (maid, cook, driver, etc.)
     * rather than a single-visit entry. The guard looks up by phone/name and the
     * system auto-approves if within the accessSchedule window.
     */
    isTrusted: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Category of trusted visitor (Maid, Cook, Driver, etc.)
    category: {
      type: String,
      enum: { values: [...TRUSTED_VISITOR_CATEGORIES], message: "Invalid category" },
      default: null,
    },

    // Pass validity
    passType: {
      type: String,
      enum: { values: [...TRUSTED_PASS_TYPES], message: "Invalid passType" },
      default: "monthly",
    },
    // When this trusted pass expires (null = permanent)
    validUntil: {
      type: Date,
      default: null,
    },

    /**
     * Schedule window — when auto-entry is allowed.
     * days: 0=Sun, 1=Mon, … 6=Sat  (matches JS Date.getDay())
     * fromTime / toTime: "HH:MM" in 24-hour format (IST)
     * If omitted, auto-entry is allowed any time within validity.
     */
    accessSchedule: {
      days:     { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] }, // all days
      fromTime: { type: String, default: "00:00" },
      toTime:   { type: String, default: "23:59" },
    },

    // Optional ID proof uploaded by the resident (Cloudinary URL)
    idProofUrl: {
      type: String,
      default: null,
    },

    // How many times this trusted pass has been used (entry count)
    entryCount: {
      type: Number,
      default: 0,
    },

    // ── Flow D: Delivery Auto-Exit ─────────────────────────────────────────────
    /**
     * For Delivery purpose: set by the service when entry is granted.
     * The cron job auto-marks exit if still "approved" past this timestamp.
     * Configurable via DELIVERY_AUTO_EXIT_MINUTES env var (default 15).
     */
    deliveryAutoExitAt: {
      type: Date,
      default: null,
      // Index defined below as visitorSchema.index({ deliveryAutoExitAt: 1 }, { sparse: true })
      // Do NOT add index: true here — that would create a duplicate non-sparse index.
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
// Flow C: find trusted passes by society + host + phone quickly
visitorSchema.index({ society: 1, isTrusted: 1, phone: 1 });
visitorSchema.index({ society: 1, isTrusted: 1, host: 1, validUntil: 1 });
// Flow D: delivery auto-exit
visitorSchema.index({ deliveryAutoExitAt: 1 }, { sparse: true });

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
module.exports.TRUSTED_VISITOR_CATEGORIES = TRUSTED_VISITOR_CATEGORIES;
module.exports.TRUSTED_PASS_TYPES = TRUSTED_PASS_TYPES;
/**
 * SocietyApplication Model
 *
 * Tracks the full lifecycle of a society onboarding request:
 *   applied → pending → approved / rejected
 *
 * On approval:
 *   • A Society document is created automatically.
 *   • An admin User account is created for the applicant.
 *   • A Subscription document is created (trial plan, 30 days).
 *   • The applicant receives their login credentials (via email in production).
 */
const mongoose = require("mongoose");

const APPLICATION_STATUSES = Object.freeze(["pending", "approved", "rejected"]);

const societyApplicationSchema = new mongoose.Schema(
  {
    // ── Society details ──────────────────────────────────────────────────────
    societyName: {
      type:      String,
      required:  [true, "Society name is required"],
      trim:      true,
      maxlength: [120, "Society name too long"],
    },
    address: {
      type:      String,
      required:  [true, "Address is required"],
      trim:      true,
      maxlength: [300, "Address too long"],
    },
    city: {
      type:    String,
      trim:    true,
      maxlength: [80, "City name too long"],
    },
    state: {
      type:    String,
      trim:    true,
      maxlength: [80, "State name too long"],
    },
    totalUnits: {
      type:    Number,
      min:     [1, "Must have at least 1 unit"],
      max:     [5000, "Exceeded maximum unit count"],
      default: 0,
    },
    description: {
      type:    String,
      trim:    true,
      maxlength: [500, "Description too long"],
      default: null,
    },

    // ── Society admin / applicant details ────────────────────────────────────
    adminName: {
      type:     String,
      required: [true, "Admin name is required"],
      trim:     true,
      maxlength:[80, "Name too long"],
    },
    adminEmail: {
      type:      String,
      required:  [true, "Admin email is required"],
      lowercase: true,
      trim:      true,
      match:     [/^\S+@\S+\.\S+$/, "Invalid email"],
    },
    adminPhone: {
      type:  String,
      trim:  true,
      match: [/^\+?[0-9]{7,15}$/, "Invalid phone number"],
    },

    // ── Review ────────────────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    { values: APPLICATION_STATUSES, message: "Invalid status" },
      default: "pending",
      index:   true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "SuperAdmin",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    reviewNote: {
      type:    String,
      trim:    true,
      maxlength: [500, "Review note too long"],
      default: null,
    },

    // ── Post-approval links ───────────────────────────────────────────────────
    // Populated after the application is approved
    society: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Society",
      default: null,
    },
    adminUser: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },

    // ── Source tracking ───────────────────────────────────────────────────────
    // IP of the applicant (stored for abuse prevention)
    applicantIp: { type: String, default: null },
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

societyApplicationSchema.index({ adminEmail: 1 });
societyApplicationSchema.index({ status: 1, createdAt: -1 });

const SocietyApplication = mongoose.model("SocietyApplication", societyApplicationSchema);
module.exports = { SocietyApplication, APPLICATION_STATUSES };

const mongoose = require("mongoose");
const crypto = require("crypto");

const societySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Society name is required"],
      trim: true,
      maxlength: [120, "Society name too long"],
    },
    address: {
      type: String,
      trim: true,
      maxlength: [300, "Address too long"],
    },
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    // Admin (chairman/secretary) who manages the society
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Unique 8-character alphanumeric join code residents use to request membership
    joinCode: {
      type: String,
      unique: true,
      uppercase: true,
    },
    // Toggle open/invite-only registration
    joinMode: {
      type: String,
      enum: ["open", "approval"],
      default: "approval",
    },
    totalUnits: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // ── Super Admin fields (added for multi-society platform) ──────────────────
    //
    // approvalStatus: reflects where this society is in the onboarding pipeline.
    //   "approved" is the default so that societies created via the old direct
    //   path (seed / admin self-creation) continue to work without migration.
    //
    approvalStatus: {
      type:    String,
      enum:    ["pending", "approved", "rejected"],
      default: "approved",
      index:   true,
    },

    // Reference to the SocietyApplication that led to this society being created.
    // Null for societies created via the old seed / direct flow.
    application: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "SocietyApplication",
      default: null,
    },

    // Which super admin approved / created this society
    registeredBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "SuperAdmin",
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

// ─── Generate a unique join code before first save ─────────────────────────
societySchema.pre("validate", function (next) {
  if (this.isNew && !this.joinCode) {
    this.joinCode = crypto.randomBytes(4).toString("hex").toUpperCase(); // e.g. "A3F0B2C1"
  }
  next();
});

const Society = mongoose.model("Society", societySchema);
module.exports = Society;

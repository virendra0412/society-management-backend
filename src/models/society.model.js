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

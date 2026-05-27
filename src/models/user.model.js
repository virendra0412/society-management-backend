const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { bcryptSaltRounds } = require("../config/env");

const ROLES = Object.freeze(["resident", "admin", "vendor"]);

// ─── Sub-schema: Family Member ─────────────────────────────────────────────────
const familyMemberSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Family member name is required"],
      trim: true,
      maxlength: [80, "Name too long"],
    },
    relation: {
      type: String,
      trim: true,
      maxlength: [40, "Relation too long"],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[0-9]{7,15}$/, "Invalid phone number"],
      default: null,
    },
  },
  { _id: true, timestamps: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [80, "Name cannot exceed 80 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[0-9]{7,15}$/, "Please provide a valid phone number"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    role: {
      type: String,
      enum: { values: ROLES, message: `Role must be one of: ${ROLES.join(", ")}` },
      default: "resident",
    },
    society: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Society",
      default: null,
    },
    flat: {
      type: String,
      trim: true,
      maxlength: [20, "Flat number too long"],
      default: null,
    },
    // FIX 1: renamed block → wing
    wing: {
      type: String,
      trim: true,
      maxlength: [30, "Wing/Block name too long"],
      default: null,
    },
    avatar: {
      type: String,
      default: null,
    },
    familyMembers: {
      type: [familyMemberSchema],
      default: [],
      validate: [arr => arr.length <= 10, "Maximum 10 family members allowed"],
    },
    isActive:   { type: Boolean, default: true },
    isApproved: { type: Boolean, default: false },
    // FIX 2: FCM token for push notifications (one token per device/session)
    fcmToken: {
      type: String,
      default: null,
      select: false,      // never leak tokens in general API responses
    },
    refreshTokenHash:      { type: String, select: false, default: null },
    loginAttempts:         { type: Number, select: false, default: 0 },
    lockUntil:             { type: Date,   select: false, default: null },
    passwordChangedAt:     { type: Date,   select: false },
    passwordResetOTP:      { type: String, select: false, default: null },
    passwordResetOTPExpires: { type: Date, select: false, default: null },
    passwordResetToken:    { type: String, select: false, default: null },
    passwordResetTokenExpires: { type: Date, select: false, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        delete ret.refreshTokenHash;
        delete ret.loginAttempts;
        delete ret.lockUntil;
        delete ret.passwordResetOTP;
        delete ret.passwordResetOTPExpires;
        delete ret.passwordResetToken;
        delete ret.passwordResetTokenExpires;
        delete ret.fcmToken;         // never expose FCM tokens
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ society: 1, role: 1 });
userSchema.index({ society: 1, isApproved: 1 });

// ─── Pre-save Hook: Hash password ─────────────────────────────────────────────
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, bcryptSaltRounds);
  if (!this.isNew) this.passwordChangedAt = new Date();
  next();
});

// ─── Instance Methods ─────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

userSchema.methods.incrementLoginAttempts = async function () {
  this.loginAttempts += 1;
  if (this.loginAttempts >= 5) {
    this.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
  }
  return this.save({ validateBeforeSave: false });
};

userSchema.methods.resetLoginAttempts = function () {
  this.loginAttempts = 0;
  this.lockUntil = null;
  return this.save({ validateBeforeSave: false });
};

userSchema.methods.isTokenIssuedAfterPasswordChange = function (tokenIat) {
  if (this.passwordChangedAt) {
    const changedTimestamp = Math.floor(this.passwordChangedAt.getTime() / 1000);
    return tokenIat > changedTimestamp;
  }
  return true;
};

userSchema.methods.createPasswordResetOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.passwordResetOTP = crypto.createHash("sha256").update(otp).digest("hex");
  this.passwordResetOTPExpires = new Date(Date.now() + 10 * 60 * 1000);
  return otp;
};

const User = mongoose.model("User", userSchema);

module.exports = User;
module.exports.ROLES = ROLES;

/**
 * SuperAdmin Model
 *
 * Completely separate from the regular User model. SuperAdmins have their own
 * collection, their own JWT secret, and their own auth middleware — regular
 * user tokens CANNOT access super admin routes even if a user's role is "admin".
 *
 * Created via the seed / CLI only. There is intentionally no public registration
 * endpoint for super admins.
 */
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const crypto   = require("crypto");
const { bcryptSaltRounds } = require("../config/env");

const superAdminSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, "Name is required"],
      trim:      true,
      maxlength: [80, "Name too long"],
    },
    email: {
      type:      String,
      required:  [true, "Email is required"],
      unique:    true,
      lowercase: true,
      trim:      true,
      match:     [/^\S+@\S+\.\S+$/, "Invalid email"],
    },
    password: {
      type:      String,
      required:  [true, "Password is required"],
      minlength: [10, "Password must be at least 10 characters"],
      select:    false,
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },

    // ── Session ──────────────────────────────────────────────────────────────
    refreshTokenHash: { type: String, select: false, default: null },
    passwordChangedAt: { type: Date, default: null },

    // ── Brute-force protection ────────────────────────────────────────────────
    loginAttempts: { type: Number, default: 0 },
    lockUntil:     { type: Date,   default: null },

    // ── Password reset ────────────────────────────────────────────────────────
    passwordResetOTP:        { type: String, select: false, default: null },
    passwordResetOTPExpires: { type: Date,   select: false, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        delete ret.password;
        delete ret.refreshTokenHash;
        delete ret.passwordResetOTP;
        delete ret.passwordResetOTPExpires;
        return ret;
      },
    },
  }
);

// ─── Pre-save: hash password ───────────────────────────────────────────────
superAdminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, bcryptSaltRounds);
  this.passwordChangedAt = new Date();
  next();
});

// ─── Compare password ──────────────────────────────────────────────────────
superAdminSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

// ─── Login attempt tracking ────────────────────────────────────────────────
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

superAdminSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

superAdminSchema.methods.incrementLoginAttempts = async function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    // Lock has expired — reset
    this.loginAttempts = 1;
    this.lockUntil = null;
  } else {
    this.loginAttempts += 1;
    if (this.loginAttempts >= MAX_ATTEMPTS) {
      this.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    }
  }
  await this.save({ validateBeforeSave: false });
};

superAdminSchema.methods.resetLoginAttempts = async function () {
  this.loginAttempts = 0;
  this.lockUntil     = null;
  await this.save({ validateBeforeSave: false });
};

// ─── Token issued-after-password-change check ──────────────────────────────
superAdminSchema.methods.isTokenIssuedAfterPasswordChange = function (iatSeconds) {
  if (!this.passwordChangedAt) return true;
  return Math.floor(this.passwordChangedAt.getTime() / 1000) < iatSeconds;
};

// ─── Password reset OTP ───────────────────────────────────────────────────
superAdminSchema.methods.createPasswordResetOTP = function () {
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  this.passwordResetOTP        = crypto.createHash("sha256").update(otp).digest("hex");
  this.passwordResetOTPExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  return otp;
};

const SuperAdmin = mongoose.model("SuperAdmin", superAdminSchema);
module.exports = SuperAdmin;

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const userRepository = require("../repositories/user.repository");
const Society = require("../models/society.model");
const AppError = require("../utils/AppError");
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require("../utils/token");

class AuthService {
  _buildTokenPayload(user) {
    return {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      societyId: user.society?.toString() || null,
    };
  }

  async _issueTokenPair(user) {
    const payload = this._buildTokenPayload(user);
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken({ userId: user._id.toString() });

    const hash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    await userRepository.storeRefreshTokenHash(user._id, hash);

    return { accessToken, refreshToken };
  }

  async register({ name, email, phone, password, societyJoinCode, flat, wing }) {
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw AppError.conflict("An account with this email already exists.", "EMAIL_TAKEN");
    }

    let society = null;
    let isApproved = false;

    if (societyJoinCode) {
      society = await Society.findOne({ joinCode: societyJoinCode.toUpperCase() });
      if (!society) throw AppError.badRequest("Invalid society join code.");
      if (society.joinMode === "open") isApproved = true;
    }

    const user = await userRepository.create({
      name,
      email,
      phone,
      password,
      flat,
      wing: wing || null,
      society: society?._id || null,
      isApproved,
    });

    const tokens = await this._issueTokenPair(user);

    return {
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, isApproved, society },
      ...tokens,
      pendingApproval: !isApproved && !!society,
    };
  }

  async login({ email, password }) {
    const user = await userRepository.findByEmail(email, true);
    const INVALID_MSG = "Invalid email or password.";

    if (!user) throw AppError.unauthorized(INVALID_MSG);
    if (!user.isActive) throw AppError.forbidden("This account has been deactivated.");
    if (user.isLocked()) {
      throw AppError.tooMany(
        "Account is temporarily locked due to too many failed login attempts. Please try again in 15 minutes."
      );
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incrementLoginAttempts();
      throw AppError.unauthorized(INVALID_MSG);
    }

    if (user.loginAttempts > 0) {
      await user.resetLoginAttempts();
    }

    const tokens = await this._issueTokenPair(user);
    const populated = await userRepository.findById(user._id);
    return { user: populated, ...tokens };
  }

  async refreshTokens(incomingRefreshToken) {
    const decoded = verifyRefreshToken(incomingRefreshToken);

    const user = await userRepository.findById(decoded.userId, true);
    if (!user || !user.refreshTokenHash) {
      throw AppError.unauthorized("Invalid session. Please log in again.");
    }

    const hash = crypto.createHash("sha256").update(incomingRefreshToken).digest("hex");
    const storedHash = user.refreshTokenHash;
    if (storedHash !== hash) {
      await userRepository.clearRefreshToken(user._id);
      throw AppError.unauthorized(
        "Refresh token reuse detected. All sessions have been invalidated. Please log in again."
      );
    }

    const tokens = await this._issueTokenPair(user);
    return tokens;
  }

  async logout(userId) {
    await userRepository.clearRefreshToken(userId);
  }

  // ── NEW: Forgot password — generate & log OTP (wire email in prod) ─────────
  async forgotPassword(email) {
    const user = await userRepository.findByEmailForReset(email);

    // Always return a generic message to prevent email enumeration
    if (!user || !user.isActive) {
      return { message: "If that email exists, an OTP has been sent." };
    }

    // Generate OTP using the model method (hashes it internally)
    const otp = user.createPasswordResetOTP();
    await user.save({ validateBeforeSave: false });

    // ── In production: send otp via email/SMS. ────────────────────────────────
    // e.g. await emailService.sendPasswordResetOTP(user.email, otp);
    // For development, log to console and include in response for easy Postman testing:
    const devOtp = process.env.NODE_ENV !== "production" ? otp : undefined;
    console.log(`[DEV] Password reset OTP for ${email}: ${otp}`);

    return {
      message: "If that email exists, an OTP has been sent.",
      ...(devOtp && { devOtp }),
    };
  }

  // ── NEW: Reset password using the OTP ─────────────────────────────────────
  async resetPassword({ email, otp, newPassword }) {
    const user = await userRepository.findByEmailForReset(email);

    if (!user || !user.passwordResetOTP || !user.passwordResetOTPExpires) {
      throw AppError.badRequest("Invalid or expired OTP. Please request a new one.");
    }

    if (new Date() > user.passwordResetOTPExpires) {
      // Clear expired OTP
      await userRepository.clearResetOTP(user._id);
      throw AppError.badRequest("OTP has expired. Please request a new one.");
    }

    // Hash incoming OTP and compare
    const otpHash = crypto.createHash("sha256").update(otp.toString()).digest("hex");
    if (otpHash !== user.passwordResetOTP) {
      throw AppError.badRequest("Invalid OTP.");
    }

    // Update password (pre-save hook will hash it) and clear reset fields
    user.password = newPassword;
    user.passwordResetOTP = null;
    user.passwordResetOTPExpires = null;
    user.refreshTokenHash = null; // invalidate all existing sessions
    await user.save();

    return { message: "Password reset successfully. Please log in with your new password." };
  }
}

module.exports = new AuthService();

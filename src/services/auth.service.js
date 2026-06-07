const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const userRepository = require("../repositories/user.repository");
const Society = require("../models/society.model");
const AppError = require("../utils/AppError");
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require("../utils/token");

class AuthService {
  /**
   * Build JWT payload from user + a specific societyId context.
   * role, permissions, flat and committeeTitle are resolved from the matching membership.
   */
  _buildTokenPayload(user, societyId) {
    const membership = societyId ? user.getMembership(societyId) : null;
    return {
      userId:         user._id.toString(),
      email:          user.email,
      societyId:      societyId ? societyId.toString() : null,
      role:           membership?.role || null,
      flat:           membership?.flat || null,
      committeeTitle: membership?.committeeTitle || null,
      permissions:    membership?.permissions || null,
    };
  }

  async _issueTokenPair(user, societyId) {
    const payload = this._buildTokenPayload(user, societyId);
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

    // Build initial memberships array if joining a society
    const memberships = society
      ? [{ society: society._id, flat, wing: wing || null, role: "resident", isApproved }]
      : [];

    const user = await userRepository.create({
      name,
      email,
      phone,
      password,
      memberships,
      activeSocietyId: society?._id || null,
    });

    const tokens = await this._issueTokenPair(user, society?._id || null);

    return {
      user: { _id: user._id, name: user.name, email: user.email, memberships: user.memberships, activeSocietyId: user.activeSocietyId },
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

    // Use the stored activeSocietyId (last used society) for the JWT
    const activeSocietyId = user.activeSocietyId || user.memberships[0]?.society || null;

    const tokens = await this._issueTokenPair(user, activeSocietyId);
    const populated = await userRepository.findById(user._id);
    return { user: populated, ...tokens };
  }

  /**
   * Switch the active society context. Issues a new JWT with the new societyId.
   * Validates that the user is an approved member of the requested society.
   */
  async switchSociety(userId, newSocietyId) {
    const user = await userRepository.findById(userId);
    if (!user) throw AppError.notFound("User not found.");

    const membership = user.getMembership(newSocietyId);
    if (!membership) {
      throw AppError.forbidden("You are not a member of this society.");
    }
    if (!membership.isApproved) {
      throw AppError.forbidden("Your membership in this society is pending approval.");
    }

    // Persist the new active society on the user document
    await userRepository.setActiveSociety(userId, newSocietyId);

    // Re-fetch with populated memberships for clean response
    const updatedUser = await userRepository.findById(userId);

    // Issue a fresh token pair with new society context
    const tokens = await this._issueTokenPair(updatedUser, newSocietyId);

    return { user: updatedUser, ...tokens };
  }

  /**
   * Join a second (or first) society using a join code.
   * If user already has an account, adds a new membership entry.
   */
  async joinSociety(userId, { societyJoinCode, flat, wing }) {
    const society = await Society.findOne({ joinCode: societyJoinCode.toUpperCase() });
    if (!society) throw AppError.badRequest("Invalid society join code.");

    const user = await userRepository.findById(userId);
    if (!user) throw AppError.notFound("User not found.");

    // Check if already a member
    const existing = user.getMembership(society._id);
    if (existing) {
      throw AppError.conflict("You are already a member of this society.");
    }

    const isApproved = society.joinMode === "open";
    const newMembership = {
      society:    society._id,
      flat:       flat || null,
      wing:       wing || null,
      role:       "resident",
      isApproved,
    };

    const updatedUser = await userRepository.addMembership(userId, newMembership);

    return {
      user: updatedUser,
      pendingApproval: !isApproved,
      society: { _id: society._id, name: society.name },
    };
  }

  async refreshTokens(incomingRefreshToken) {
    const decoded = verifyRefreshToken(incomingRefreshToken);

    const user = await userRepository.findById(decoded.userId, true);
    if (!user || !user.refreshTokenHash) {
      throw AppError.unauthorized("Invalid session. Please log in again.");
    }

    const hash = crypto.createHash("sha256").update(incomingRefreshToken).digest("hex");
    if (user.refreshTokenHash !== hash) {
      await userRepository.clearRefreshToken(user._id);
      throw AppError.unauthorized(
        "Refresh token reuse detected. All sessions have been invalidated. Please log in again."
      );
    }

    // Keep the same active society when refreshing
    const activeSocietyId = user.activeSocietyId || user.memberships[0]?.society || null;
    return this._issueTokenPair(user, activeSocietyId);
  }

  async logout(userId) {
    await userRepository.clearRefreshToken(userId);
  }

  async forgotPassword(email) {
    const user = await userRepository.findByEmailForReset(email);
    if (!user || !user.isActive) {
      return { message: "If that email exists, an OTP has been sent." };
    }

    const otp = user.createPasswordResetOTP();
    await user.save({ validateBeforeSave: false });

    const devOtp = process.env.NODE_ENV !== "production" ? otp : undefined;
    console.log(`[DEV] Password reset OTP for ${email}: ${otp}`);

    return {
      message: "If that email exists, an OTP has been sent.",
      ...(devOtp && { devOtp }),
    };
  }

  async resetPassword({ email, otp, newPassword }) {
    const user = await userRepository.findByEmailForReset(email);

    if (!user || !user.passwordResetOTP || !user.passwordResetOTPExpires) {
      throw AppError.badRequest("Invalid or expired OTP. Please request a new one.");
    }

    if (new Date() > user.passwordResetOTPExpires) {
      await userRepository.clearResetOTP(user._id);
      throw AppError.badRequest("OTP has expired. Please request a new one.");
    }

    const otpHash = crypto.createHash("sha256").update(otp.toString()).digest("hex");
    if (otpHash !== user.passwordResetOTP) {
      throw AppError.badRequest("Invalid OTP.");
    }

    user.password = newPassword;
    user.passwordResetOTP = null;
    user.passwordResetOTPExpires = null;
    user.refreshTokenHash = null;
    await user.save();

    return { message: "Password reset successfully. Please log in with your new password." };
  }
}

module.exports = new AuthService();

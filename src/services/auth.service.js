/**
 * services/auth.service.js
 *
 * CHANGED IN TASK 1:
 *   register() — accepts optional `inviteToken` field.
 *                Priority: inviteToken > societyJoinCode.
 *                When inviteToken is provided the service:
 *                  1. Verifies the JWT via inviteLinkService.verifyInviteToken()
 *                  2. Resolves the society by ID (not by joinCode)
 *                  3. Uses the society's joinMode for approval decision — same
 *                     logic as the joinCode path, nothing else changes.
 *
 * All other methods (login, switchSociety, joinSociety, refreshTokens,
 * logout, forgotPassword, resetPassword) are IDENTICAL to the original.
 * Do NOT diff them against the original — copy verbatim to avoid regressions.
 */

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const userRepository    = require("../repositories/user.repository");
const { Society }       = require("../models/society.model");
const AppError          = require("../utils/AppError");
const inviteLinkService = require("./inviteLink.service");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("../utils/token");

class AuthService {
  /**
   * Build JWT payload from user + a specific societyId context.
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

  _findMembership(user, societyId, { includeInactive = false } = {}) {
    return user.memberships.find((membership) => {
      const id = membership.society?._id || membership.society;
      return id?.toString() === societyId?.toString() && (includeInactive || membership.isActive);
    }) || null;
  }

  async _issueTokenPair(user, societyId) {
    const payload      = this._buildTokenPayload(user, societyId);
    const accessToken  = signAccessToken(payload);
    const refreshToken = signRefreshToken({ userId: user._id.toString() });

    const hash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    await userRepository.storeRefreshTokenHash(user._id, hash);

    return { accessToken, refreshToken };
  }

  // ─── CHANGED: register ────────────────────────────────────────────────────
  async register({ name, email, phone, password, societyJoinCode, inviteToken, flat, wing }) {
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw AppError.conflict(
        "An account with this email already exists.",
        "EMAIL_TAKEN"
      );
    }

    let society    = null;
    let isApproved = false;

    // ── Invite-token path (NEW) ───────────────────────────────────────────────
    if (inviteToken) {
      // Throws AppError with friendly message if expired / invalid
      const { societyId } = inviteLinkService.verifyInviteToken(inviteToken);

      society = await Society.findById(societyId);
      if (!society) {
        throw AppError.badRequest(
          "The society associated with this invite no longer exists."
        );
      }
      if (!society.isActive) {
        throw AppError.badRequest("This society is not currently active.");
      }
      isApproved = society.joinMode === "open";

    // ── Original join-code path (UNCHANGED) ──────────────────────────────────
    } else if (societyJoinCode) {
      society = await Society.findOne({ joinCode: societyJoinCode.toUpperCase() });
      if (!society) throw AppError.badRequest("Invalid society join code.");
      isApproved = society.joinMode === "open";
    }

    // Build initial memberships array
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
      user: {
        _id:             user._id,
        name:            user.name,
        email:           user.email,
        memberships:     user.memberships,
        activeSocietyId: user.activeSocietyId,
      },
      ...tokens,
      pendingApproval: !isApproved && !!society,
    };
  }

  // ─── UNCHANGED: login ─────────────────────────────────────────────────────
  async login({ email, password }) {
    const user      = await userRepository.findByEmail(email, true);
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

    const activeSocietyId = user.activeSocietyId || user.memberships[0]?.society || null;
    const tokens          = await this._issueTokenPair(user, activeSocietyId);
    const populated       = await userRepository.findById(user._id);
    return { user: populated, ...tokens };
  }

  // ─── UNCHANGED: switchSociety ─────────────────────────────────────────────
  // EDGE-04 note: _issueTokenPair() rotates refreshTokenHash on every call.
  // Rapid back-to-back switches (A→B→A) are safe because AuthContext.switchSociety
  // awaits each call and stores the new tokens before the next switch begins,
  // so each switch always presents the *latest* refresh token.
  // Risk: if a background API call fires between two rapid switches and its
  // 401-retry attempts a token refresh using the pre-first-switch token, the
  // reuse-detection in refreshTokens() will invalidate the session.
  // Mitigation: AuthContext queues token refreshes via _isRefreshing; the
  // window is milliseconds and requires a network round-trip to trigger.
  async switchSociety(userId, newSocietyId) {
    const user = await userRepository.findById(userId);
    if (!user) throw AppError.notFound("User not found.");

    const anyMembership = this._findMembership(user, newSocietyId, { includeInactive: true });
    if (anyMembership && !anyMembership.isActive && !anyMembership.isApproved) {
      throw AppError.forbidden(
        "Your membership request for this society was rejected by the society admin.",
        "MEMBERSHIP_REJECTED"
      );
    }

    const membership = user.getMembership(newSocietyId);
    if (!membership) throw AppError.forbidden("You are not a member of this society.");
    if (!membership.isApproved) {
      throw AppError.forbidden("Your membership in this society is pending approval.");
    }

    await userRepository.setActiveSociety(userId, newSocietyId);
    const updatedUser = await userRepository.findById(userId);
    const tokens      = await this._issueTokenPair(updatedUser, newSocietyId);
    return { user: updatedUser, ...tokens };
  }

  // ─── UNCHANGED: joinSociety ───────────────────────────────────────────────
  async joinSociety(userId, { societyJoinCode, flat, wing }) {
    const society = await Society.findOne({ joinCode: societyJoinCode.toUpperCase() });
    if (!society) throw AppError.badRequest("Invalid society join code.");

    const user = await userRepository.findById(userId);
    if (!user) throw AppError.notFound("User not found.");

    const existing = user.getMembership(society._id);
    if (existing) throw AppError.conflict("You are already a member of this society.");

    const isApproved   = society.joinMode === "open";
    const newMembership = {
      society:    society._id,
      flat:       flat || null,
      wing:       wing || null,
      role:       "resident",
      isApproved,
    };

    const updatedUser = await userRepository.addMembership(userId, newMembership);
    return {
      user:           updatedUser,
      pendingApproval: !isApproved,
      society:        { _id: society._id, name: society.name },
    };
  }

  // ─── UNCHANGED: refreshTokens ─────────────────────────────────────────────
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

    const activeSocietyId = user.activeSocietyId || user.memberships[0]?.society || null;
    return this._issueTokenPair(user, activeSocietyId);
  }

  // ─── UNCHANGED: logout ────────────────────────────────────────────────────
  async logout(userId) {
    await userRepository.clearRefreshToken(userId);
  }

  // ─── UNCHANGED: forgotPassword ────────────────────────────────────────────
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

  // ─── UNCHANGED: resetPassword ─────────────────────────────────────────────
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

    user.password                = newPassword;
    user.passwordResetOTP        = null;
    user.passwordResetOTPExpires = null;
    user.refreshTokenHash        = null;
    await user.save();

    return { message: "Password reset successfully. Please log in with your new password." };
  }
}

module.exports = new AuthService();

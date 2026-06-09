/**
 * services/inviteLink.service.js
 *
 * Generates and verifies signed invite-link JWT tokens.
 *
 * Token payload: { societyId, type: "invite", iat, exp }
 * Signed with JWT_ACCESS_SECRET (same key, different `type` claim so it
 * can never be confused with a user access token — verifyAccessToken
 * checks for userId which invite tokens deliberately omit).
 *
 * Expiry: 7 days (configurable via INVITE_LINK_EXPIRES_IN env var).
 */

const jwt    = require("jsonwebtoken");
const crypto = require("crypto");
const { Society } = require("../models/society.model");
const AppError    = require("../utils/AppError");
const { jwt: jwtConfig, env } = require("../config/env");

// ─── Invite token TTL ─────────────────────────────────────────────────────────
const INVITE_EXPIRES_IN = process.env.INVITE_LINK_EXPIRES_IN || "7d";

// ─── Separate secret for invite tokens ───────────────────────────────────────
// Falls back to accessSecret so no extra env var is required,
// but you can override with INVITE_LINK_SECRET for better isolation.
const INVITE_SECRET =
  process.env.INVITE_LINK_SECRET || jwtConfig.accessSecret;

class InviteLinkService {
  /**
   * Generate a signed invite JWT for a society.
   * Only the society admin may call this.
   *
   * Returns:
   *   { token, expiresAt, inviteUrl, qrData }
   */
  async generateInviteLink(societyId) {
    const society = await Society.findById(societyId).select(
      "_id name isActive"
    );
    if (!society) throw AppError.notFound("Society not found.");
    if (!society.isActive)
      throw AppError.forbidden("Cannot generate invite for an inactive society.");

    const payload = {
      societyId: societyId.toString(),
      type:      "invite",
      // jti — unique per token so we can optionally revoke later
      jti: crypto.randomBytes(8).toString("hex"),
    };

    const token = jwt.sign(payload, INVITE_SECRET, {
      expiresIn: INVITE_EXPIRES_IN,
      issuer:    "society-app",
    });

    // Decode to read the exact expiry set by jwt.sign
    const decoded   = jwt.decode(token);
    const expiresAt = new Date(decoded.exp * 1000).toISOString();

    // Deep-link URL: societyapp://join-invite/TOKEN
    // The mobile handler reads this scheme from app.json `scheme`.
    const inviteUrl = `societyapp://join-invite/${token}`;

    // qrData is what you embed in the QR code — same deep link.
    // Admin screen passes this string to react-native-qrcode-svg.
    const qrData = inviteUrl;

    return {
      token,
      expiresAt,
      inviteUrl,
      qrData,
      societyName: society.name,
    };
  }

  /**
   * Verify and decode an invite token.
   * Returns { societyId } on success; throws AppError on failure.
   */
  verifyInviteToken(token) {
    try {
      const decoded = jwt.verify(token, INVITE_SECRET, {
        issuer: "society-app",
      });

      if (decoded.type !== "invite" || !decoded.societyId) {
        throw AppError.badRequest("Invalid invite link.");
      }

      return { societyId: decoded.societyId };
    } catch (err) {
      if (err.isOperational) throw err; // Re-throw AppError
      if (err.name === "TokenExpiredError") {
        throw AppError.badRequest(
          "This invite link has expired. Please ask the admin to generate a new one.",
          "INVITE_EXPIRED"
        );
      }
      throw AppError.badRequest("Invalid or malformed invite link.", "INVITE_INVALID");
    }
  }
}

module.exports = new InviteLinkService();
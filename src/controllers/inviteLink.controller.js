/**
 * controllers/inviteLink.controller.js
 *
 * POST /society/:id/invite-link   → generate invite link + QR data
 * GET  /society/:id/invite-link/verify?token=TOKEN  → verify without joining
 *
 * Admin only — checked by requireRole("admin") in the router.
 */

const inviteLinkService = require("../services/inviteLink.service");
const { sendSuccess }   = require("../utils/response");

class InviteLinkController {
  /**
   * POST /society/:id/invite-link
   * Generates a signed invite JWT for this society.
   * Returns: { token, expiresAt, inviteUrl, qrData, societyName }
   */
  async generateInviteLink(req, res) {
    const societyId = req.params.id;

    // Extra guard: the admin must belong to THIS society (requireRole ensures
    // they are admin, requireSociety ensures societyId on JWT matches,
    // but we also confirm param matches their active society to prevent
    // an admin generating links for a different society by manipulating the URL)
    if (req.societyId && req.societyId.toString() !== societyId.toString()) {
      const AppError = require("../utils/AppError");
      throw AppError.forbidden(
        "You can only generate invite links for your own society."
      );
    }

    const result = await inviteLinkService.generateInviteLink(societyId);

    return sendSuccess(res, {
      statusCode: 201,
      message:    "Invite link generated successfully.",
      data:       result,
    });
  }

  /**
   * GET /invite-link/verify?token=TOKEN
   * Public endpoint — lets the mobile deep-link handler pre-validate a token
   * before showing the registration screen, so we can surface a friendly error
   * early if the link is expired.
   *
   * Returns: { societyId, societyName }
   */
  async verifyInviteToken(req, res) {
    const { token } = req.query;
    if (!token) {
      const AppError = require("../utils/AppError");
      throw AppError.badRequest("token query parameter is required.");
    }

    // Verify JWT
    const { societyId } = inviteLinkService.verifyInviteToken(token);

    // Fetch society name for display on the register screen
    const { Society } = require("../models/society.model");
    const society = await Society.findById(societyId).select("name isActive");
    if (!society || !society.isActive) {
      const AppError = require("../utils/AppError");
      throw AppError.notFound("Society not found or no longer active.");
    }

    return sendSuccess(res, {
      message: "Invite token is valid.",
      data: {
        societyId:   societyId,
        societyName: society.name,
      },
    });
  }
}

module.exports = new InviteLinkController();
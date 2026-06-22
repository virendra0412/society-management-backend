/**
 * controllers/user.controller.js
 *
 * CHANGED IN TASK 2:
 *   approveMember() — writes audit log "member.approved"
 *   rejectMember()  — writes audit log "member.rejected"
 *
 * All other methods are IDENTICAL to the original.
 */

const userService   = require("../services/user.service");
const { sendSuccess } = require("../utils/response");
const { audit }     = require("../middlewares/audit.middleware"); // NEW
const logger        = require("../utils/logger");

class UserController {
  // ── Profile ────────────────────────────────────────────────────────────────
  async getProfile(req, res) {
    return sendSuccess(res, { data: { user: req.user } });
  }

  async updateProfile(req, res) {
    const user = await userService.updateProfile(req.user._id, req.body);
    return sendSuccess(res, {
      message: "Profile updated successfully.",
      data: { user },
    });
  }

  // ── Avatar ─────────────────────────────────────────────────────────────────
  async uploadAvatar(req, res) {
    const result = await userService.uploadAvatar(req.user._id, req.file);
    return sendSuccess(res, {
      message: "Avatar updated.",
      data: result,
    });
  }

  // ── Family Members ─────────────────────────────────────────────────────────
  async addFamilyMember(req, res) {
    const user = await userService.addFamilyMember(req.user._id, req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Family member added.",
      data: { familyMembers: user.familyMembers },
    });
  }

  async updateFamilyMember(req, res) {
    const user = await userService.updateFamilyMember(
      req.user._id,
      req.params.memberId,
      req.body
    );
    return sendSuccess(res, {
      message: "Family member updated.",
      data: { familyMembers: user.familyMembers },
    });
  }

  async removeFamilyMember(req, res) {
    const user = await userService.removeFamilyMember(req.user._id, req.params.memberId);
    return sendSuccess(res, {
      message: "Family member removed.",
      data: { familyMembers: user.familyMembers },
    });
  }

  // ── Admin: Member Approval ─────────────────────────────────────────────────
  async getPendingMembers(req, res) {
    const societyId = req.societyId;
    const members = await userService.getPendingMembers(societyId);
    return sendSuccess(res, { data: { members } });
  }

  async getApprovedMembers(req, res) {
    const societyId = req.societyId;
    const members = await userService.getApprovedMembers(societyId);
    return sendSuccess(res, { data: { members } });
  }

  // ── CHANGED: approveMember ─────────────────────────────────────────────────
  async approveMember(req, res) {
    const societyId = req.societyId;
    const user      = await userService.approveMember(societyId, req.params.userId);

    // Audit: who approved whom, in which society
    await audit(req, "member.approved", "User", req.params.userId, {
      approvedBy: req.user._id,
      societyId,
    });

    return sendSuccess(res, {
      message: "Member approved.",
      data: { user },
    });
  }

  // ── CHANGED: rejectMember ──────────────────────────────────────────────────
  async rejectMember(req, res) {
    const societyId = req.societyId;
    await userService.rejectMember(societyId, req.params.userId);

    // Audit: who rejected whom, in which society
    await audit(req, "member.rejected", "User", req.params.userId, {
      rejectedBy: req.user._id,
      societyId,
    });

    return sendSuccess(res, { message: "Member rejected and account deactivated." });
  }

  // ── FCM Token ──────────────────────────────────────────────────────────────
  async updateFcmToken(req, res) {
    const { fcmToken } = req.body;

    // STEP 1 — Did the request arrive at all with a token?
    // If this line never appears in logs: the mobile app is not calling
    // PATCH /users/fcm-token after login (check NotificationContext mount order).
    // If fcmToken is "(null)": getExpoPushTokenAsync() failed on device
    // (missing projectId in app.json or permissions denied).
    logger.info("[FCM] updateFcmToken called", {
      userId:          req.user?._id?.toString(),
      tokenReceived:   !!fcmToken,
      tokenPrefix:     fcmToken ? fcmToken.slice(0, 30) + "…" : "(null)",
      isExpoToken:     fcmToken?.startsWith("ExponentPushToken") ?? false,
    });

    if (!fcmToken) {
      logger.warn("[FCM] Null/empty token received — clearing stored token for user. " +
        "This is normal on logout but unexpected on login.");
    }

    await userService.updateFcmToken(req.user._id, fcmToken || null);

    // STEP 2 — Token saved to DB
    logger.info("[FCM] Token saved to DB successfully", {
      userId: req.user?._id?.toString(),
    });

    return sendSuccess(res, { message: "FCM token updated." });
  }

  // ── Committee Management ───────────────────────────────────────────────────
  async getCommitteeMembers(req, res) {
    const societyId = req.societyId;
    const members = await userService.getCommitteeMembers(societyId);
    return sendSuccess(res, { data: { members } });
  }

  async assignCommitteeRole(req, res) {
    const societyId = req.societyId;
    const { role, committeeTitle, permissions } = req.body;

    const user = await userService.assignCommitteeRole(societyId, req.params.userId, {
      role,
      committeeTitle,
      permissions,
    });

    return sendSuccess(res, {
      message: "Committee role assigned successfully.",
      data: { user },
    });
  }

  async removeCommitteeRole(req, res) {
    const societyId = req.societyId;
    const user = await userService.removeCommitteeRole(societyId, req.user._id, req.params.userId);
    return sendSuccess(res, {
      message: "Committee role removed. User is now a resident.",
      data: { user },
    });
  }
}

module.exports = new UserController();
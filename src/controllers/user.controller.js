const userService = require("../services/user.service");
const { sendSuccess } = require("../utils/response");

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
    const societyId = req.user.society?._id || req.user.society;
    const members = await userService.getPendingMembers(societyId);
    return sendSuccess(res, { data: { members } });
  }

  async approveMember(req, res) {
    const societyId = req.user.society?._id || req.user.society;
    const user = await userService.approveMember(societyId, req.params.userId);
    return sendSuccess(res, {
      message: "Member approved.",
      data: { user },
    });
  }

  async rejectMember(req, res) {
    const societyId = req.user.society?._id || req.user.society;
    await userService.rejectMember(societyId, req.params.userId);
    return sendSuccess(res, { message: "Member rejected and account deactivated." });
  }

  // ── FCM Token (push notifications) ────────────────────────────────────────
  /**
   * PATCH /users/fcm-token
   * Body: { fcmToken: string }
   *
   * Frontend calls this on login and every app-open to keep the token fresh.
   * Pass fcmToken: null to unregister (e.g. on logout).
   */
  async updateFcmToken(req, res) {
    const { fcmToken } = req.body;
    await userService.updateFcmToken(req.user._id, fcmToken || null);
    return sendSuccess(res, { message: "FCM token updated." });
  }
}

module.exports = new UserController();

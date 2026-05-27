const userRepository = require("../repositories/user.repository");
const AppError = require("../utils/AppError");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudinary");

class UserService {
  // ── Profile ────────────────────────────────────────────────────────────────
  async getProfile(userId) {
    return userRepository.findById(userId);
  }

  async updateProfile(userId, updates) {
    const ALLOWED = ["name", "phone", "flat", "wing"];
    const safeUpdates = {};
    ALLOWED.forEach((field) => {
      if (updates[field] !== undefined) safeUpdates[field] = updates[field];
    });
    if (Object.keys(safeUpdates).length === 0) {
      throw AppError.badRequest("No valid fields provided.");
    }
    return userRepository.updateById(userId, safeUpdates);
  }

  // ── Avatar ─────────────────────────────────────────────────────────────────
  async uploadAvatar(userId, file) {
    if (!file) throw AppError.badRequest("No image file provided.");

    // Get existing avatar to delete from Cloudinary if it exists
    const user = await userRepository.findById(userId);

    const result = await uploadToCloudinary(file.buffer, {
      folder: "society-app/avatars",
      public_id: `user_${userId}`,
      overwrite: true,
      transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
    });

    const updated = await userRepository.updateAvatar(userId, result.secure_url);
    return { avatar: updated.avatar };
  }

  // ── Family Members ─────────────────────────────────────────────────────────
  async addFamilyMember(userId, memberData) {
    const user = await userRepository.findById(userId);
    if (user.familyMembers.length >= 10) {
      throw AppError.badRequest("Maximum 10 family members allowed.");
    }
    return userRepository.addFamilyMember(userId, memberData);
  }

  async removeFamilyMember(userId, memberId) {
    const user = await userRepository.findById(userId);
    const exists = user?.familyMembers?.some((m) => m._id.toString() === memberId);
    if (!exists) throw AppError.notFound("Family member not found.");
    return userRepository.removeFamilyMember(userId, memberId);
  }

  async updateFamilyMember(userId, memberId, updates) {
    const user = await userRepository.findById(userId);
    const exists = user?.familyMembers?.some((m) => m._id.toString() === memberId);
    if (!exists) throw AppError.notFound("Family member not found.");
    return userRepository.updateFamilyMember(userId, memberId, updates);
  }

  // ── Admin: Member Approval ─────────────────────────────────────────────────
  async getPendingMembers(societyId) {
    return userRepository.findPendingMembers(societyId);
  }

  async approveMember(adminSocietyId, userId) {
    const target = await userRepository.findById(userId);
    if (!target) throw AppError.notFound("User not found.");
    if (target.society?.toString() !== adminSocietyId?.toString()) {
      throw AppError.forbidden("User does not belong to your society.");
    }
    if (target.isApproved) {
      throw AppError.badRequest("Member is already approved.");
    }
    return userRepository.approveMember(userId);
  }

  async rejectMember(adminSocietyId, userId) {
    const target = await userRepository.findById(userId);
    if (!target) throw AppError.notFound("User not found.");
    if (target.society?.toString() !== adminSocietyId?.toString()) {
      throw AppError.forbidden("User does not belong to your society.");
    }
    return userRepository.rejectMember(userId);
  }

  // ── FCM token ──────────────────────────────────────────────────────────────
  async updateFcmToken(userId, fcmToken) {
    return userRepository.updateFcmToken(userId, fcmToken);
  }
}

module.exports = new UserService();

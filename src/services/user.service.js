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

    const user = await userRepository.findById(userId);
    if (!user) throw AppError.notFound("User not found.");
    const updatesMembership = safeUpdates.flat !== undefined || safeUpdates.wing !== undefined;
    if (updatesMembership && !user.activeSocietyId) {
      throw AppError.badRequest("No active society selected.");
    }

    if (!updatesMembership) {
      return userRepository.updateById(userId, safeUpdates);
    }

    const updatedUser = await userRepository.updateProfile(userId, {
      ...safeUpdates,
      activeSocietyId: user.activeSocietyId,
    });
    if (!updatedUser) throw AppError.badRequest("Active society membership not found.");
    return updatedUser;
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

  async getApprovedMembers(societyId) {
    return userRepository.findApprovedMembers(societyId);
  }

  async approveMember(adminSocietyId, userId) {
    const target = await userRepository.findById(userId);
    if (!target) throw AppError.notFound("User not found.");
    const membership = target.getMembership(adminSocietyId);
    if (!membership) {
      throw AppError.forbidden("User does not belong to your society.");
    }
    if (membership.isApproved) {
      throw AppError.badRequest("Member is already approved.");
    }
    return userRepository.approveMember(userId, adminSocietyId);
  }

  async rejectMember(adminSocietyId, userId) {
    const target = await userRepository.findById(userId);
    if (!target) throw AppError.notFound("User not found.");
    const membership = target.getMembership(adminSocietyId);
    if (!membership) {
      throw AppError.forbidden("User does not belong to your society.");
    }
    return userRepository.rejectMember(userId, adminSocietyId);
  }

  // ── FCM token ──────────────────────────────────────────────────────────────
  async updateFcmToken(userId, fcmToken) {
    return userRepository.updateFcmToken(userId, fcmToken);
  }

  // ── Committee management ───────────────────────────────────────────────────
  async getCommitteeMembers(societyId) {
    return userRepository.findCommitteeMembers(societyId);
  }

  /**
   * Assign or update a committee role on a user's membership for the given society.
   * - role must be one of: admin, committee, security
   * - permissions is an optional map of module → level overrides
   * - committeeTitle is an optional display label (e.g. "Treasurer")
   * - Auto-seeds default permissions for the role if not explicitly provided
   */
  async assignCommitteeRole(adminSocietyId, targetUserId, { role, permissions, committeeTitle }) {
    const { ROLES, ROLE_DEFAULT_PERMISSIONS } = require("../models/user.model");

    const COMMITTEE_ROLES = ["admin", "committee", "security"];
    if (!COMMITTEE_ROLES.includes(role)) {
      throw AppError.badRequest(`Invalid committee role. Must be one of: ${COMMITTEE_ROLES.join(", ")}`);
    }

    const target = await userRepository.findById(targetUserId);
    if (!target) throw AppError.notFound("User not found.");

    const membership = target.getMembership(adminSocietyId);
    if (!membership) throw AppError.forbidden("User is not a member of this society.");
    if (!membership.isApproved) throw AppError.badRequest("User must be approved before assigning a committee role.");

    // Seed defaults for the target role, then apply any explicit overrides
    const basePerms = { ...ROLE_DEFAULT_PERMISSIONS[role] };
    const mergedPerms = permissions ? { ...basePerms, ...permissions } : basePerms;

    return userRepository.assignCommitteeRole(targetUserId, adminSocietyId, {
      role,
      permissions: mergedPerms,
      committeeTitle: committeeTitle || null,
    });
  }

  /**
   * Demote a committee member back to resident.
   * Cannot demote yourself (prevents lockout).
   */
  async removeCommitteeRole(adminSocietyId, adminUserId, targetUserId) {
    if (adminUserId.toString() === targetUserId.toString()) {
      throw AppError.badRequest("You cannot remove your own committee role.");
    }

    const target = await userRepository.findById(targetUserId);
    if (!target) throw AppError.notFound("User not found.");

    const membership = target.getMembership(adminSocietyId);
    if (!membership) throw AppError.forbidden("User is not a member of this society.");
    if (membership.role === "resident") throw AppError.badRequest("User is already a resident.");

    return userRepository.removeCommitteeRole(targetUserId, adminSocietyId);
  }
}

module.exports = new UserService();

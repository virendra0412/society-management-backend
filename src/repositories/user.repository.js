const User = require("../models/user.model");

class UserRepository {
  /**
   * Find user by email. Optionally include sensitive fields for auth flows.
   */
  async findByEmail(email, selectSensitive = false) {
    let query = User.findOne({ email: email.toLowerCase() });
    if (selectSensitive) {
      query = query.select(
        "+password +refreshTokenHash +loginAttempts +lockUntil +passwordChangedAt"
      );
    }
    return query.exec();
  }

  async findByEmailForReset(email) {
    return User.findOne({ email: email.toLowerCase() })
      .select("+passwordResetOTP +passwordResetOTPExpires")
      .exec();
  }

  async findById(id, selectSensitive = false) {
    let query = User.findById(id);
    if (selectSensitive) {
      query = query.select("+refreshTokenHash +loginAttempts +lockUntil +passwordChangedAt");
    }
    // Populate all society refs inside memberships + activeSocietyId
    return query
      .populate("memberships.society", "name joinCode joinMode logo")
      .populate("activeSocietyId", "name joinCode joinMode logo")
      .exec();
  }

  async create(data) {
    const user = new User(data);
    return user.save();
  }

  async updateById(id, updates) {
    return User.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).exec();
  }

  async updateProfile(id, updates) {
    const setObj = {};
    if (updates.name !== undefined) setObj.name = updates.name;
    if (updates.phone !== undefined) setObj.phone = updates.phone;
    if (updates.flat !== undefined) setObj["memberships.$.flat"] = updates.flat;
    if (updates.wing !== undefined) setObj["memberships.$.wing"] = updates.wing;

    return User.findOneAndUpdate(
      { _id: id, "memberships.society": updates.activeSocietyId },
      { $set: setObj },
      { new: true, runValidators: true }
    )
      .populate("memberships.society", "name joinCode joinMode logo")
      .populate("activeSocietyId", "name joinCode joinMode logo")
      .exec();
  }

  async storeRefreshTokenHash(userId, hash) {
    return User.findByIdAndUpdate(userId, { refreshTokenHash: hash }).exec();
  }

  async clearRefreshToken(userId) {
    return User.findByIdAndUpdate(userId, { refreshTokenHash: null }).exec();
  }

  // ── Multi-society: set the active society ─────────────────────────────────
  async setActiveSociety(userId, societyId) {
    return User.findByIdAndUpdate(
      userId,
      { activeSocietyId: societyId },
      { new: true }
    )
      .populate("memberships.society", "name joinCode joinMode logo")
      .populate("activeSocietyId", "name joinCode joinMode logo")
      .exec();
  }

  // ── Multi-society: add a new membership entry ──────────────────────────────
  async addMembership(userId, membership) {
    return User.findByIdAndUpdate(
      userId,
      { $push: { memberships: membership } },
      { new: true, runValidators: true }
    )
      .populate("memberships.society", "name joinCode joinMode logo")
      .exec();
  }

  // ── Multi-society: approve a membership for a specific society ─────────────
  async approveMembership(userId, societyId) {
    return User.findOneAndUpdate(
      { _id: userId, "memberships.society": societyId },
      { $set: { "memberships.$.isApproved": true } },
      { new: true }
    ).exec();
  }

  // ── Multi-society: deactivate a membership ─────────────────────────────────
  // TC-MS-004: sets isActive: false AND isApproved: false on the membership
  // subdoc only — the top-level user.isActive is NOT touched, so the user can
  // still log in and access other society memberships.
  async deactivateMembership(userId, societyId) {
    return User.findOneAndUpdate(
      { _id: userId, "memberships.society": societyId },
      { $set: { "memberships.$.isActive": false, "memberships.$.isApproved": false } },
      { new: true }
    ).exec();
  }

  // ── Society members query (reads from memberships array) ───────────────────
  async findSocietyMembers(societyId, { page, limit, skip }) {
    const [members, total] = await Promise.all([
      User.find({
        memberships: {
          $elemMatch: { society: societyId, isActive: true },
        },
        isActive: true,
      })
        .select("name email avatar memberships activeSocietyId createdAt")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      User.countDocuments({
        memberships: {
          $elemMatch: { society: societyId, isActive: true },
        },
        isActive: true,
      }),
    ]);
    return { members, total };
  }

  // ── Pending member approval ────────────────────────────────────────────────
  async findPendingMembers(societyId) {
    return User.find({
      memberships: {
        $elemMatch: { society: societyId, isApproved: false, isActive: true },
      },
      isActive: true,
    })
      .select("name email phone memberships createdAt")
      .sort({ createdAt: 1 })
      .exec();
  }

  async approveMember(userId, societyId) {
    return this.approveMembership(userId, societyId);
  }

  async rejectMember(userId, societyId) {
    return this.deactivateMembership(userId, societyId);
  }

  // ── Avatar ─────────────────────────────────────────────────────────────────
  async updateAvatar(userId, avatarUrl) {
    return User.findByIdAndUpdate(
      userId,
      { avatar: avatarUrl },
      { new: true }
    ).exec();
  }

  // ── Family members CRUD ────────────────────────────────────────────────────
  async addFamilyMember(userId, member) {
    return User.findByIdAndUpdate(
      userId,
      { $push: { familyMembers: member } },
      { new: true, runValidators: true }
    ).exec();
  }

  async removeFamilyMember(userId, memberId) {
    return User.findByIdAndUpdate(
      userId,
      { $pull: { familyMembers: { _id: memberId } } },
      { new: true }
    ).exec();
  }

  async updateFamilyMember(userId, memberId, updates) {
    const setObj = {};
    Object.entries(updates).forEach(([k, v]) => {
      setObj[`familyMembers.$.${k}`] = v;
    });
    return User.findOneAndUpdate(
      { _id: userId, "familyMembers._id": memberId },
      { $set: setObj },
      { new: true, runValidators: true }
    ).exec();
  }

  // ── Password reset OTP ─────────────────────────────────────────────────────
  async saveResetOTP(userId, otpHash, expiresAt) {
    return User.findByIdAndUpdate(
      userId,
      { passwordResetOTP: otpHash, passwordResetOTPExpires: expiresAt },
      { validateBeforeSave: false }
    ).exec();
  }

  async clearResetOTP(userId) {
    return User.findByIdAndUpdate(userId, {
      passwordResetOTP: null,
      passwordResetOTPExpires: null,
    }).exec();
  }

  // ── FCM token (push notifications) ────────────────────────────────────────
  async findByIdWithFcm(id) {
    return User.findById(id).select("+fcmToken").exec();
  }

  async updateFcmToken(userId, fcmToken) {
    return User.findByIdAndUpdate(userId, { fcmToken }, { new: true }).exec();
  }

  // ── Committee management ───────────────────────────────────────────────────

  /**
   * List all committee members (non-resident roles) in a society.
   */
  async findCommitteeMembers(societyId) {
    return User.find({
      memberships: {
        $elemMatch: {
          society: societyId,
          isActive: true,
          isApproved: true,
          role: { $in: ["admin", "committee", "security"] },
        },
      },
      isActive: true,
    })
      .select("name email phone avatar memberships")
      .sort({ name: 1 })
      .exec();
  }

  /**
   * Assign or update committee role + permissions for a user in a society.
   * Sets role, permissions, and committeeTitle on the matching membership.
   */
  async assignCommitteeRole(userId, societyId, { role, permissions, committeeTitle }) {
    const setObj = { "memberships.$.role": role };
    if (committeeTitle !== undefined) setObj["memberships.$.committeeTitle"] = committeeTitle;

    // Merge provided permissions into the membership
    if (permissions && typeof permissions === "object") {
      Object.entries(permissions).forEach(([module, level]) => {
        setObj[`memberships.$.permissions.${module}`] = level;
      });
    }

    return User.findOneAndUpdate(
      { _id: userId, "memberships.society": societyId },
      { $set: setObj },
      { new: true, runValidators: true }
    )
      .populate("memberships.society", "name joinCode joinMode logo")
      .exec();
  }

  /**
   * Demote a committee member back to resident, clearing title + permissions.
   */
  async removeCommitteeRole(userId, societyId) {
    const { ROLE_DEFAULT_PERMISSIONS } = require("../models/user.model");
    const residentPerms = ROLE_DEFAULT_PERMISSIONS.resident;
    const setObj = {
      "memberships.$.role": "resident",
      "memberships.$.committeeTitle": null,
    };
    Object.entries(residentPerms).forEach(([module, level]) => {
      setObj[`memberships.$.permissions.${module}`] = level;
    });

    return User.findOneAndUpdate(
      { _id: userId, "memberships.society": societyId },
      { $set: setObj },
      { new: true }
    )
      .populate("memberships.society", "name joinCode joinMode logo")
      .exec();
  }

  /**
   * Retrieve all non-null FCM tokens for approved members of a society.
   * Reads from memberships array.
   */
  async getFcmTokensBySociety(societyId) {
    const users = await User.find({
      memberships: {
        $elemMatch: { society: societyId, isApproved: true, isActive: true },
      },
      isActive: true,
      fcmToken: { $ne: null },
    })
      .select("+fcmToken")
      .exec();
    return users.map((u) => u.fcmToken).filter(Boolean);
  }
}

module.exports = new UserRepository();

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
  async deactivateMembership(userId, societyId) {
    return User.findOneAndUpdate(
      { _id: userId, "memberships.society": societyId },
      { $set: { "memberships.$.isActive": false } },
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
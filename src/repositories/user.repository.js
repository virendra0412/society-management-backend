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
    return query.populate("society", "name joinCode joinMode").exec();
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

  async findSocietyMembers(societyId, { page, limit, skip }) {
    const [members, total] = await Promise.all([
      User.find({ society: societyId, isActive: true })
        .select("name email flat wing role isApproved avatar createdAt")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      User.countDocuments({ society: societyId, isActive: true }),
    ]);
    return { members, total };
  }

  // ── NEW: Pending member approval ───────────────────────────────────────────
  async findPendingMembers(societyId) {
    return User.find({ society: societyId, isApproved: false, isActive: true })
      .select("name email flat wing phone createdAt")
      .sort({ createdAt: 1 })
      .exec();
  }

  async approveMember(userId) {
    return User.findByIdAndUpdate(
      userId,
      { isApproved: true },
      { new: true }
    ).exec();
  }

  // ── NEW: Reject / remove a pending member ──────────────────────────────────
  async rejectMember(userId) {
    return User.findByIdAndUpdate(
      userId,
      { isActive: false },
      { new: true }
    ).exec();
  }

  // ── NEW: Avatar update ─────────────────────────────────────────────────────
  async updateAvatar(userId, avatarUrl) {
    return User.findByIdAndUpdate(
      userId,
      { avatar: avatarUrl },
      { new: true }
    ).exec();
  }

  // ── NEW: Family members CRUD ───────────────────────────────────────────────
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

  // ── NEW: Store / clear password reset OTP ─────────────────────────────────
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
  /**
   * Find a single user by ID and explicitly select +fcmToken.
   * Use this anywhere you need to send a push notification to a specific user.
   * (fcmToken has select:false in the schema so findById() never returns it.)
   */
  async findByIdWithFcm(id) {
    return User.findById(id)
      .select("+fcmToken")
      .exec();
  }

  /**
   * Store or replace the FCM token for a user's current device.
   * Call this on every login / app-open from the frontend.
   */
  async updateFcmToken(userId, fcmToken) {
    return User.findByIdAndUpdate(userId, { fcmToken }, { new: true }).exec();
  }

  /**
   * Retrieve all non-null FCM tokens for members of a society.
   * Used to fan out push notifications.
   */
  async getFcmTokensBySociety(societyId) {
    const users = await User.find({
      society:    societyId,
      isApproved: true,
      isActive:   true,
      fcmToken:   { $ne: null },
    })
      .select("+fcmToken")
      .exec();
    return users.map((u) => u.fcmToken).filter(Boolean);
  }
}

module.exports = new UserRepository();

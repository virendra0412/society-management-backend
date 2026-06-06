const Visitor = require("../models/visitor.model");

const HOST_SELECT = "name flat wing phone";
const GUARD_SELECT = "name role";

class VisitorRepository {
  async create(data) {
    return Visitor.create(data);
  }

  /**
   * Find a single visitor by ID, with entryOTPHash selected for OTP verification.
   */
  async findById(id) {
    return Visitor.findById(id)
      .populate("host", HOST_SELECT)
      .populate("loggedBy", GUARD_SELECT)
      .populate("approvedBy", GUARD_SELECT)
      .exec();
  }

  /**
   * findById but also selects entryOTPHash (needed for OTP verification).
   */
  async findByIdForOTP(id) {
    return Visitor.findById(id)
      .select("+entryOTPHash")
      .exec();
  }

  /**
   * List visitors for a society with optional filters and pagination.
   */
  async findBySociety(societyId, filters = {}, { skip, limit }, sort = { createdAt: -1 }) {
    const query = { society: societyId, ...filters };
    const [visitors, total] = await Promise.all([
      Visitor.find(query)
        .populate("host", HOST_SELECT)
        .populate("loggedBy", GUARD_SELECT)
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Visitor.countDocuments(query),
    ]);
    return { visitors, total };
  }

  /**
   * List visitors for a specific host (resident's own visitor history).
   */
  async findByHost(hostId, filters = {}, { skip, limit }) {
    const query = { host: hostId, ...filters };
    const [visitors, total] = await Promise.all([
      Visitor.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Visitor.countDocuments(query),
    ]);
    return { visitors, total };
  }

  /**
   * Find all "invited" or "pending" visitors whose OTP has expired.
   * Used by the cleanup job.
   */
  async findExpiredOTPVisitors() {
    return Visitor.find({
      status: { $in: ["invited"] },
      entryOTPExpires: { $lt: new Date() },
    }).exec();
  }

  async updateById(id, updates) {
    return Visitor.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    })
      .populate("host", HOST_SELECT)
      .populate("approvedBy", GUARD_SELECT)
      .exec();
  }

  /**
   * Bulk-expire visitors whose OTP has passed.
   */
  async expireOldInvites() {
    return Visitor.updateMany(
      { status: "invited", entryOTPExpires: { $lt: new Date() } },
      { $set: { status: "expired" } }
    ).exec();
  }

  /**
   * Mark entry: set status → approved, entryTime, approvedBy, clear OTP hash.
   */
  async markEntry(visitorId, approvedByUserId) {
    return Visitor.findByIdAndUpdate(
      visitorId,
      {
        $set: {
          status: "approved",
          entryTime: new Date(),
          approvedAt: new Date(),
          approvedBy: approvedByUserId,
          entryOTPHash: null,
          entryOTPExpires: null,
        },
      },
      { new: true }
    )
      .populate("host", HOST_SELECT)
      .populate("approvedBy", GUARD_SELECT)
      .exec();
  }

  /**
   * Mark exit: set status → exited, exitTime.
   */
  async markExit(visitorId) {
    return Visitor.findByIdAndUpdate(
      visitorId,
      { $set: { status: "exited", exitTime: new Date() } },
      { new: true }
    ).exec();
  }

  // ─── Flow C: Trusted Visitor Methods ──────────────────────────────────────

  /**
   * Find all active trusted pass records for a resident.
   */
  async findTrustedByHost(hostId, filters = {}) {
    const query = { host: hostId, isTrusted: true, ...filters };
    return Visitor.find(query)
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find active trusted passes for a society — used by guards to look up visitors.
   * Filters to non-expired passes only.
   */
  async findTrustedBySociety(societyId, { phone, name } = {}) {
    const query = {
      society: societyId,
      isTrusted: true,
      status: { $nin: ["expired", "rejected"] },
      $or: [
        { validUntil: null },
        { validUntil: { $gte: new Date() } },
      ],
    };
    if (phone) query.phone = phone;
    if (name) query.name = new RegExp(name, "i");
    return Visitor.find(query)
      .populate("host", "name flat wing phone")
      .exec();
  }

  /**
   * Increment entryCount on a trusted pass and set last entryTime.
   */
  async recordTrustedEntry(visitorId) {
    return Visitor.findByIdAndUpdate(
      visitorId,
      {
        $inc: { entryCount: 1 },
        $set: { entryTime: new Date(), status: "approved" },
      },
      { new: true }
    ).exec();
  }

  /**
   * Find trusted passes expiring within the next N days — used to notify residents.
   */
  async findExpiringTrustedPasses(withinDays = 7) {
    const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
    return Visitor.find({
      isTrusted: true,
      passType: { $ne: "permanent" },
      validUntil: { $lte: cutoff, $gte: new Date() },
      status: { $nin: ["expired", "rejected"] },
    })
      .populate("host", "name flat wing fcmToken")
      .exec();
  }

  /**
   * Expire trusted passes that have passed their validUntil date.
   */
  async expireOldTrustedPasses() {
    return Visitor.updateMany(
      {
        isTrusted: true,
        passType: { $ne: "permanent" },
        validUntil: { $lt: new Date() },
        status: { $nin: ["expired", "rejected"] },
      },
      { $set: { status: "expired" } }
    ).exec();
  }

  // ─── Flow D: Delivery Auto-Exit ──────────────────────────────────────────

  /**
   * Find all "approved" delivery visitors whose auto-exit time has passed.
   */
  async findDeliveryAutoExitDue() {
    return Visitor.find({
      status: "approved",
      purpose: "Delivery",
      deliveryAutoExitAt: { $lte: new Date() },
    }).exec();
  }

  /**
   * Bulk auto-exit deliveries past their auto-exit time.
   */
  async autoExitDeliveries() {
    return Visitor.updateMany(
      {
        status: "approved",
        purpose: "Delivery",
        deliveryAutoExitAt: { $lte: new Date() },
      },
      { $set: { status: "exited", exitTime: new Date() } }
    ).exec();
  }
}

module.exports = new VisitorRepository();
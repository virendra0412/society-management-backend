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
}

module.exports = new VisitorRepository();

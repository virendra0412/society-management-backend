const { ParkingSlot, ParkingRequest } = require("../models/parking.model");

const USER_SELECT = "name flat wing phone";
const ADMIN_SELECT = "name role";

class ParkingRepository {
  // ─── Slots ─────────────────────────────────────────────────────────────────

  async createSlot(data) {
    return ParkingSlot.create(data);
  }

  async createManySlots(dataArray) {
    return ParkingSlot.insertMany(dataArray, { ordered: false });
  }

  async findSlotById(id) {
    return ParkingSlot.findById(id)
      .populate("assignedTo", USER_SELECT)
      .populate("assignedBy", ADMIN_SELECT)
      .exec();
  }

  async findSlotsBySociety(societyId, filters = {}) {
    const query = { society: societyId, isActive: true, ...filters };
    return ParkingSlot.find(query)
      .populate("assignedTo", USER_SELECT)
      .sort({ zone: 1, slotNumber: 1 })
      .exec();
  }

  /**
   * Find one available slot of the requested type for assignment.
   * Atomic: uses findOneAndUpdate to avoid race conditions when two
   * admins assign simultaneously.
   */
  async findAndLockAvailableSlot(societyId, slotType) {
    return ParkingSlot.findOneAndUpdate(
      { society: societyId, type: slotType, status: "available", isActive: true },
      { $set: { status: "assigned" } }, // temporarily lock it
      { new: true, sort: { slotNumber: 1 } }
    ).exec();
  }

  async updateSlot(slotId, updates) {
    return ParkingSlot.findByIdAndUpdate(slotId, updates, {
      new: true,
      runValidators: true,
    })
      .populate("assignedTo", USER_SELECT)
      .exec();
  }

  /**
   * Release a slot — clear assignment and set status back to available.
   */
  async releaseSlot(slotId) {
    return ParkingSlot.findByIdAndUpdate(
      slotId,
      {
        $set: {
          status:        "available",
          assignedTo:    null,
          assignedFlat:  null,
          vehicleNumber: null,
          assignedAt:    null,
          assignedBy:    null,
        },
      },
      { new: true }
    ).exec();
  }

  /**
   * Count available slots per type for a society.
   * Returns an array: [{ _id: "4W", count: 5 }, { _id: "2W", count: 3 }, …]
   */
  async getAvailabilityByType(societyId) {
    return ParkingSlot.aggregate([
      { $match: { society: societyId, isActive: true } },
      {
        $group: {
          _id: "$type",
          total:     { $sum: 1 },
          available: { $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] } },
          assigned:  { $sum: { $cond: [{ $eq: ["$status", "assigned"] }, 1, 0] } },
          blocked:   { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec();
  }

  // ─── Requests ──────────────────────────────────────────────────────────────

  async createRequest(data) {
    return ParkingRequest.create(data);
  }

  async findRequestById(id) {
    return ParkingRequest.findById(id)
      .populate("requestedBy", USER_SELECT)
      .populate("assignedSlot")
      .populate("resolvedBy", ADMIN_SELECT)
      .exec();
  }

  async findRequestsBySociety(societyId, filters = {}, { skip, limit }) {
    const query = { society: societyId, ...filters };
    const [requests, total] = await Promise.all([
      ParkingRequest.find(query)
        .populate("requestedBy", USER_SELECT)
        .populate("assignedSlot", "slotNumber zone type")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ParkingRequest.countDocuments(query),
    ]);
    return { requests, total };
  }

  async findRequestsByResident(residentId, { skip, limit }) {
    const [requests, total] = await Promise.all([
      ParkingRequest.find({ requestedBy: residentId })
        .populate("assignedSlot", "slotNumber zone type")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ParkingRequest.countDocuments({ requestedBy: residentId }),
    ]);
    return { requests, total };
  }

  async updateRequest(requestId, updates) {
    return ParkingRequest.findByIdAndUpdate(requestId, updates, {
      new: true,
      runValidators: true,
    })
      .populate("requestedBy", USER_SELECT)
      .populate("assignedSlot", "slotNumber zone type")
      .populate("resolvedBy", ADMIN_SELECT)
      .exec();
  }

  /**
   * Check if a resident already has a pending request for the same slot type.
   */
  async hasPendingRequest(residentId, slotType) {
    return ParkingRequest.exists({
      requestedBy: residentId,
      slotType,
      status: "pending",
    });
  }
}

module.exports = new ParkingRepository();

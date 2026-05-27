const { Amenity, AmenityBooking } = require("../models/amenity.model");

const USER_SELECT = "name flat wing";

class AmenityRepository {
  // ─── Amenity CRUD ─────────────────────────────────────────────────────────

  async createAmenity(data) {
    return Amenity.create(data);
  }

  async findAmenityById(id) {
    return Amenity.findById(id).populate("createdBy", "name role").exec();
  }

  async findAmenitiesBySociety(societyId, includeInactive = false) {
    const query = { society: societyId };
    if (!includeInactive) query.isActive = true;
    return Amenity.find(query).sort({ category: 1, name: 1 }).exec();
  }

  async updateAmenity(amenityId, updates) {
    return Amenity.findByIdAndUpdate(amenityId, updates, {
      new: true,
      runValidators: true,
    }).exec();
  }

  // ─── Booking CRUD ─────────────────────────────────────────────────────────

  async createBooking(data) {
    return AmenityBooking.create(data);
  }

  async findBookingById(id) {
    return AmenityBooking.findById(id)
      .populate("amenity", "name category requiresApproval")
      .populate("bookedBy", USER_SELECT)
      .populate("cancelledBy", "name role")
      .exec();
  }

  async findBookingsBySociety(societyId, filters = {}, { skip, limit }) {
    const query = { society: societyId, ...filters };
    const [bookings, total] = await Promise.all([
      AmenityBooking.find(query)
        .populate("amenity", "name category")
        .populate("bookedBy", USER_SELECT)
        .sort({ startTime: -1 })
        .skip(skip)
        .limit(limit),
      AmenityBooking.countDocuments(query),
    ]);
    return { bookings, total };
  }

  async findBookingsByUser(userId, filters = {}, { skip, limit }) {
    const query = { bookedBy: userId, ...filters };
    const [bookings, total] = await Promise.all([
      AmenityBooking.find(query)
        .populate("amenity", "name category")
        .sort({ startTime: -1 })
        .skip(skip)
        .limit(limit),
      AmenityBooking.countDocuments(query),
    ]);
    return { bookings, total };
  }

  async updateBooking(bookingId, updates) {
    return AmenityBooking.findByIdAndUpdate(bookingId, updates, {
      new: true,
      runValidators: true,
    })
      .populate("amenity", "name category requiresApproval")
      .populate("bookedBy", USER_SELECT)
      .exec();
  }

  // ─── Slot Availability / Conflict Check ───────────────────────────────────

  /**
   * Count confirmed + pending bookings for an amenity that OVERLAP with
   * the requested [startTime, endTime] window.
   *
   * Two intervals [s1,e1] and [s2,e2] overlap iff:
   *   s1 < e2  AND  e1 > s2
   *
   * Excludes a specific bookingId (used when editing an existing booking).
   */
  async countConflictingBookings(amenityId, startTime, endTime, excludeBookingId = null) {
    const query = {
      amenity: amenityId,
      status: { $in: ["confirmed", "pending"] },
      startTime: { $lt: endTime },
      endTime:   { $gt: startTime },
    };
    if (excludeBookingId) {
      query._id = { $ne: excludeBookingId };
    }
    return AmenityBooking.countDocuments(query);
  }

  /**
   * Get all existing bookings for an amenity on a specific date (for availability display).
   * Returns confirmed + pending bookings only.
   */
  async findBookingsForDate(amenityId, date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return AmenityBooking.find({
      amenity: amenityId,
      status: { $in: ["confirmed", "pending"] },
      startTime: { $lt: dayEnd },
      endTime:   { $gt: dayStart },
    })
      .select("startTime endTime status bookedBy durationMinutes")
      .populate("bookedBy", "name flat")
      .sort({ startTime: 1 })
      .exec();
  }

  /**
   * Find all confirmed bookings whose endTime has passed.
   * Used by the completion cron job.
   */
  async findCompletableBookings() {
    return AmenityBooking.find({
      status: "confirmed",
      endTime: { $lt: new Date() },
    })
      .select("_id")
      .lean()
      .exec();
  }

  async bulkMarkCompleted(ids) {
    return AmenityBooking.updateMany(
      { _id: { $in: ids } },
      { $set: { status: "completed" } }
    ).exec();
  }
}

module.exports = new AmenityRepository();

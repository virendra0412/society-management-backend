const amenityRepository = require("../repositories/amenity.repository");
const AppError = require("../utils/AppError");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const { sendPushNotification } = require("../utils/notification");
const userRepository = require("../repositories/user.repository");

class AmenityService {
  _getSocietyId(user) {
    return user.society?._id || user.society;
  }

  // ─── Admin: Amenity CRUD ───────────────────────────────────────────────────

  async createAmenity(data, adminUser) {
    return amenityRepository.createAmenity({
      ...data,
      society:   this._getSocietyId(adminUser),
      createdBy: adminUser._id,
    });
  }

  async updateAmenity(amenityId, updates, adminUser) {
    const amenity = await amenityRepository.findAmenityById(amenityId);
    if (!amenity) throw AppError.notFound("Amenity not found.");
    if (amenity.society.toString() !== this._getSocietyId(adminUser)?.toString()) {
      throw AppError.forbidden();
    }
    return amenityRepository.updateAmenity(amenityId, updates);
  }

  async deactivateAmenity(amenityId, adminUser) {
    const amenity = await amenityRepository.findAmenityById(amenityId);
    if (!amenity) throw AppError.notFound("Amenity not found.");
    if (amenity.society.toString() !== this._getSocietyId(adminUser)?.toString()) {
      throw AppError.forbidden();
    }
    return amenityRepository.updateAmenity(amenityId, { isActive: false });
  }

  // ─── Listing ───────────────────────────────────────────────────────────────

  async getAllAmenities(societyId, user) {
    const includeInactive = user.role === "admin";
    return amenityRepository.findAmenitiesBySociety(societyId, includeInactive);
  }

  async getAmenityById(amenityId, societyId) {
    const amenity = await amenityRepository.findAmenityById(amenityId);
    if (!amenity || !amenity.isActive) throw AppError.notFound("Amenity not found.");
    if (amenity.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    return amenity;
  }

  // ─── Slot Availability ─────────────────────────────────────────────────────

  /**
   * Return booked slots for an amenity on a given date,
   * plus whether the amenity is open that day.
   */
  async getAvailability(amenityId, dateStr, societyId) {
    const amenity = await amenityRepository.findAmenityById(amenityId);
    if (!amenity) throw AppError.notFound("Amenity not found.");
    if (amenity.society.toString() !== societyId?.toString()) throw AppError.forbidden();

    const date = new Date(dateStr);
    if (isNaN(date)) throw AppError.badRequest("Invalid date format. Use YYYY-MM-DD.");

    const dayOfWeek = date.getDay();
    const isClosed  = amenity.closedDays.includes(dayOfWeek);

    const bookedSlots = isClosed
      ? []
      : await amenityRepository.findBookingsForDate(amenityId, date);

    return {
      date:                   dateStr,
      isOpen:                 !isClosed,
      openTime:               amenity.openTime,
      closeTime:              amenity.closeTime,
      maxConcurrentBookings:  amenity.maxConcurrentBookings,
      slotDurationOptions:    amenity.slotDurationOptions,
      bookedSlots:            bookedSlots.map(b => ({
        startTime:  b.startTime,
        endTime:    b.endTime,
        status:     b.status,
      })),
    };
  }

  // ─── Booking ───────────────────────────────────────────────────────────────

  async createBooking(data, residentUser) {
    const societyId = this._getSocietyId(residentUser);
    const amenity   = await amenityRepository.findAmenityById(data.amenityId);

    if (!amenity || !amenity.isActive) throw AppError.notFound("Amenity not found.");
    if (amenity.society.toString() !== societyId?.toString()) throw AppError.forbidden();

    const startTime = new Date(data.startTime);
    const endTime   = new Date(data.endTime);

    // ── Basic time validation ──────────────────────────────────────────────
    if (isNaN(startTime) || isNaN(endTime)) {
      throw AppError.badRequest("Invalid startTime or endTime.");
    }
    if (startTime <= new Date()) {
      throw AppError.badRequest("Booking start time must be in the future.");
    }
    if (endTime <= startTime) {
      throw AppError.badRequest("End time must be after start time.");
    }

    const durationMinutes = Math.round((endTime - startTime) / 60000);
    if (durationMinutes > amenity.maxSlotDuration) {
      throw AppError.badRequest(
        `Maximum booking duration is ${amenity.maxSlotDuration} minutes.`
      );
    }
    if (durationMinutes < 15) {
      throw AppError.badRequest("Minimum booking duration is 15 minutes.");
    }

    // ── Operating hours check ────────────────────────────────────────────
    const dayOfWeek = startTime.getDay();
    if (amenity.closedDays.includes(dayOfWeek)) {
      throw AppError.badRequest("The amenity is closed on this day.");
    }

    const [openH, openM]   = amenity.openTime.split(":").map(Number);
    const [closeH, closeM] = amenity.closeTime.split(":").map(Number);

    const startH = startTime.getHours() * 60 + startTime.getMinutes();
    const endH   = endTime.getHours()   * 60 + endTime.getMinutes();
    const openMinutes  = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    if (startH < openMinutes || endH > closeMinutes) {
      throw AppError.badRequest(
        `Amenity operates ${amenity.openTime}–${amenity.closeTime} only.`
      );
    }

    // ── Advance booking limit ────────────────────────────────────────────
    const maxAdvanceMs = amenity.advanceBookingDays * 24 * 60 * 60 * 1000;
    if (startTime - Date.now() > maxAdvanceMs) {
      throw AppError.badRequest(
        `You can only book up to ${amenity.advanceBookingDays} days in advance.`
      );
    }

    // ── Conflict / capacity check ────────────────────────────────────────
    const conflictCount = await amenityRepository.countConflictingBookings(
      amenity._id,
      startTime,
      endTime
    );
    if (conflictCount >= amenity.maxConcurrentBookings) {
      throw AppError.conflict(
        "This time slot is fully booked. Please choose a different time.",
        "SLOT_CONFLICT"
      );
    }

    // ── Create booking ───────────────────────────────────────────────────
    const initialStatus = amenity.requiresApproval ? "pending" : "confirmed";

    const booking = await amenityRepository.createBooking({
      amenity:   amenity._id,
      society:   societyId,
      bookedBy:  residentUser._id,
      startTime,
      endTime,
      durationMinutes,
      purpose:    data.purpose   || null,
      guestCount: data.guestCount || 1,
      status:    initialStatus,
    });

    return { booking, requiresApproval: amenity.requiresApproval };
  }

  async cancelBooking(bookingId, requestingUser, reason) {
    const booking = await amenityRepository.findBookingById(bookingId);
    if (!booking) throw AppError.notFound("Booking not found.");

    const societyId = this._getSocietyId(requestingUser);
    if (booking.society.toString() !== societyId?.toString()) throw AppError.forbidden();

    // Residents can only cancel their own bookings
    const isOwner = booking.bookedBy._id.toString() === requestingUser._id.toString();
    if (!isOwner && requestingUser.role !== "admin") {
      throw AppError.forbidden("You can only cancel your own bookings.");
    }

    if (["cancelled", "completed", "rejected"].includes(booking.status)) {
      throw AppError.badRequest(`Booking is already ${booking.status}.`);
    }

    // Residents cannot cancel past or in-progress bookings
    if (requestingUser.role !== "admin" && booking.startTime <= new Date()) {
      throw AppError.badRequest("Cannot cancel a booking that has already started.");
    }

    return amenityRepository.updateBooking(bookingId, {
      status:       "cancelled",
      cancelledBy:  requestingUser._id,
      cancelReason: reason || null,
    });
  }

  // ─── Admin: Confirm or Reject pending booking ──────────────────────────────

  async confirmBooking(bookingId, adminUser, adminNote) {
    const booking = await amenityRepository.findBookingById(bookingId);
    if (!booking) throw AppError.notFound("Booking not found.");

    const societyId = this._getSocietyId(adminUser);
    if (booking.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    if (booking.status !== "pending") {
      throw AppError.badRequest(`Cannot confirm — booking is '${booking.status}'.`);
    }

    // Re-check conflict (another booking may have been confirmed while this was pending)
    const conflictCount = await amenityRepository.countConflictingBookings(
      booking.amenity._id,
      booking.startTime,
      booking.endTime,
      booking._id
    );
    if (conflictCount >= booking.amenity.maxConcurrentBookings) {
      throw AppError.conflict(
        "Cannot confirm — the slot is now fully booked by other bookings.",
        "SLOT_CONFLICT"
      );
    }

    const updated = await amenityRepository.updateBooking(bookingId, {
      status:    "confirmed",
      adminNote: adminNote || null,
    });

    // Notify resident
    const resident = await userRepository.findById(booking.bookedBy._id);
    if (resident?.fcmToken) {
      await sendPushNotification(
        [resident.fcmToken],
        {
          title: "✅ Booking Confirmed",
          body:  `Your booking for ${booking.amenity.name} has been confirmed.`,
        },
        { type: "booking_confirmed", bookingId: booking._id.toString() }
      );
    }

    return updated;
  }

  async rejectBooking(bookingId, adminUser, adminNote) {
    const booking = await amenityRepository.findBookingById(bookingId);
    if (!booking) throw AppError.notFound("Booking not found.");

    const societyId = this._getSocietyId(adminUser);
    if (booking.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    if (booking.status !== "pending") {
      throw AppError.badRequest(`Cannot reject — booking is '${booking.status}'.`);
    }

    const updated = await amenityRepository.updateBooking(bookingId, {
      status:    "rejected",
      adminNote: adminNote || null,
    });

    // Notify resident
    const resident = await userRepository.findById(booking.bookedBy._id);
    if (resident?.fcmToken) {
      await sendPushNotification(
        [resident.fcmToken],
        {
          title: "❌ Booking Rejected",
          body:  `Your booking for ${booking.amenity.name} was not approved. ${adminNote || ""}`.trim(),
        },
        { type: "booking_rejected", bookingId: booking._id.toString() }
      );
    }

    return updated;
  }

  // ─── Bookings listing ──────────────────────────────────────────────────────

  async getAllBookings(societyId, query) {
    const { page, limit, skip } = parsePagination(query);
    const filters = {};
    if (query.status)   filters.status   = query.status;
    if (query.amenity)  filters.amenity  = query.amenity;

    const { bookings, total } = await amenityRepository.findBookingsBySociety(
      societyId, filters, { skip, limit }
    );
    return { bookings, meta: buildPaginationMeta({ total, page, limit }) };
  }

  async getMyBookings(user, query) {
    const { page, limit, skip } = parsePagination(query);
    const filters = {};
    if (query.status) filters.status = query.status;

    const { bookings, total } = await amenityRepository.findBookingsByUser(
      user._id, filters, { skip, limit }
    );
    return { bookings, meta: buildPaginationMeta({ total, page, limit }) };
  }

  async getBookingById(bookingId, requestingUser) {
    const booking = await amenityRepository.findBookingById(bookingId);
    if (!booking) throw AppError.notFound("Booking not found.");

    const societyId = this._getSocietyId(requestingUser);
    if (booking.society.toString() !== societyId?.toString()) throw AppError.forbidden();

    if (requestingUser.role !== "admin") {
      if (booking.bookedBy._id.toString() !== requestingUser._id.toString()) {
        throw AppError.forbidden("You can only view your own bookings.");
      }
    }
    return booking;
  }
}

module.exports = new AmenityService();

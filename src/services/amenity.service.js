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
   * GAP-6 FIX — Operating Hours Enforcement in UI
   *
   * Generates a full slot grid between openTime and closeTime for the requested
   * date and each duration in slotDurationOptions.  Each slot is marked
   * `available: true/false` based on whether the concurrent booking limit would
   * be exceeded, using the existing bookings for that day (single DB call).
   *
   * Response shape:
   * {
   *   date, isOpen, openTime, closeTime, dayName,
   *   closedReason?,          // human-readable if isOpen === false
   *   slots: [
   *     { startTime, endTime, durationMinutes, available, bookedCount }
   *   ]
   * }
   *
   * The frontend (AmenityScreen BookSlotModal) already consumes:
   *   res.data.slots[] with slot.startTime, slot.endTime, slot.available,
   *   slot.durationMinutes, and res.data.isOpen / res.data.openTime / closeTime.
   */
  async getAvailability(amenityId, dateStr, societyId) {
    const amenity = await amenityRepository.findAmenityById(amenityId);
    if (!amenity) throw AppError.notFound("Amenity not found.");
    if (amenity.society.toString() !== societyId?.toString()) throw AppError.forbidden();

    const date = new Date(dateStr);
    if (isNaN(date)) throw AppError.badRequest("Invalid date format. Use YYYY-MM-DD.");

    const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const dayOfWeek = date.getDay();
    const isClosed  = amenity.closedDays.includes(dayOfWeek);

    // Early return with empty slots + closed reason when amenity is shut
    if (isClosed) {
      return {
        date,
        isOpen:       false,
        openTime:     amenity.openTime,
        closeTime:    amenity.closeTime,
        dayName:      DAY_NAMES[dayOfWeek],
        closedReason: `${amenity.name} is closed on ${DAY_NAMES[dayOfWeek]}s.`,
        slots:        [],
      };
    }

    // Fetch all existing confirmed/pending bookings for the day — single DB call
    const existingBookings = await amenityRepository.findBookingsForDate(amenityId, date);

    // Parse operating window in minutes-since-midnight
    const [openH,  openM]  = amenity.openTime.split(":").map(Number);
    const [closeH, closeM] = amenity.closeTime.split(":").map(Number);
    const openMins  = openH  * 60 + openM;
    const closeMins = closeH * 60 + closeM;

    // Build date helpers
    const toDate = (minutesSinceMidnight) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      d.setMinutes(minutesSinceMidnight);
      return d;
    };

    const now = new Date();

    // Generate slots for each duration option and deduplicate by startTime+duration
    const slots = [];

    for (const durationMins of amenity.slotDurationOptions) {
      let cursor = openMins;
      while (cursor + durationMins <= closeMins) {
        const slotStart = toDate(cursor);
        const slotEnd   = toDate(cursor + durationMins);

        // Count existing bookings that overlap this window
        const bookedCount = existingBookings.filter(
          (b) => b.startTime < slotEnd && b.endTime > slotStart
        ).length;

        slots.push({
          startTime:       slotStart,
          endTime:         slotEnd,
          durationMinutes: durationMins,
          available:       slotStart > now && bookedCount < amenity.maxConcurrentBookings,
          bookedCount,
        });

        cursor += durationMins;
      }
    }

    // Sort by startTime then duration for consistent display
    slots.sort((a, b) =>
      a.startTime - b.startTime || a.durationMinutes - b.durationMinutes
    );

    return {
      date:      dateStr,
      isOpen:    true,
      openTime:  amenity.openTime,
      closeTime: amenity.closeTime,
      dayName:   DAY_NAMES[dayOfWeek],
      slots,
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

const amenityService = require("../services/amenity.service");
const { sendSuccess } = require("../utils/response");

class AmenityController {
  // ── Admin: Amenity management ─────────────────────────────────────────────
  async create(req, res) {
    const amenity = await amenityService.createAmenity(req.body, req.user);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Amenity created.",
      data: { amenity },
    });
  }

  async update(req, res) {
    const amenity = await amenityService.updateAmenity(req.params.id, req.body, req.user);
    return sendSuccess(res, { message: "Amenity updated.", data: { amenity } });
  }

  async deactivate(req, res) {
    await amenityService.deactivateAmenity(req.params.id, req.user);
    return sendSuccess(res, { message: "Amenity deactivated." });
  }

  // ── Listing ───────────────────────────────────────────────────────────────
  async getAll(req, res) {
    const amenities = await amenityService.getAllAmenities(req.societyId, req.user);
    return sendSuccess(res, { data: { amenities } });
  }

  async getOne(req, res) {
    const amenity = await amenityService.getAmenityById(req.params.id, req.societyId);
    return sendSuccess(res, { data: { amenity } });
  }

  // ── Slot availability ─────────────────────────────────────────────────────
  async getAvailability(req, res) {
    const result = await amenityService.getAvailability(
      req.params.id,
      req.query.date,
      req.societyId
    );
    return sendSuccess(res, { data: result });
  }

  // ── Bookings ──────────────────────────────────────────────────────────────
  async createBooking(req, res) {
    const { booking, requiresApproval } = await amenityService.createBooking(
      req.body,
      req.user
    );
    return sendSuccess(res, {
      statusCode: 201,
      message: requiresApproval
        ? "Booking request submitted. Awaiting admin approval."
        : "Booking confirmed.",
      data: { booking },
    });
  }

  async cancelBooking(req, res) {
    const booking = await amenityService.cancelBooking(
      req.params.bookingId,
      req.user,
      req.body.reason
    );
    return sendSuccess(res, { message: "Booking cancelled.", data: { booking } });
  }

  async confirmBooking(req, res) {
    const booking = await amenityService.confirmBooking(
      req.params.bookingId,
      req.user,
      req.body.adminNote
    );
    return sendSuccess(res, { message: "Booking confirmed.", data: { booking } });
  }

  async rejectBooking(req, res) {
    const booking = await amenityService.rejectBooking(
      req.params.bookingId,
      req.user,
      req.body.adminNote
    );
    return sendSuccess(res, { message: "Booking rejected.", data: { booking } });
  }

  async getAllBookings(req, res) {
    const { bookings, meta } = await amenityService.getAllBookings(req.societyId, req.query);
    return sendSuccess(res, { data: { bookings }, meta });
  }

  async getMyBookings(req, res) {
    const { bookings, meta } = await amenityService.getMyBookings(req.user, req.query);
    return sendSuccess(res, { data: { bookings }, meta });
  }

  async getBookingById(req, res) {
    const booking = await amenityService.getBookingById(req.params.bookingId, req.user);
    return sendSuccess(res, { data: { booking } });
  }
}

module.exports = new AmenityController();

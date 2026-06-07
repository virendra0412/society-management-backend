const express = require("express");
const router = express.Router();
const amenityController = require("../controllers/amenity.controller");
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { amenity: v } = require("../validators/phase2.validator");
const { actionLimiter } = require("../middlewares/rateLimiter.middleware");

router.use(protect, requireSociety);

// ── Amenity management (amenities:write) ──────────────────────────────────────
router.post("/",      requirePermission("amenities", "write"), validate(v.createAmenity), amenityController.create);
router.patch("/:id",  requirePermission("amenities", "write"), validate(v.updateAmenity), amenityController.update);
router.delete("/:id", requirePermission("amenities", "write"),                            amenityController.deactivate);

// ── Amenity listing (all) ─────────────────────────────────────────────────────
router.get("/",    amenityController.getAll);
router.get("/:id", amenityController.getOne);

// ── Slot availability ─────────────────────────────────────────────────────────
router.get("/:id/availability", amenityController.getAvailability);

// ── Bookings: admin/committee views all ──────────────────────────────────────
router.get("/bookings/all",  requirePermission("amenities", "read"), amenityController.getAllBookings);

// ── Bookings: resident views own ──────────────────────────────────────────────
router.get("/bookings/mine", amenityController.getMyBookings);

// ── Single booking ────────────────────────────────────────────────────────────
router.get("/bookings/:bookingId", amenityController.getBookingById);

// ── Create booking (all approved members) ────────────────────────────────────
router.post(
  "/bookings",
  actionLimiter,
  validate(v.createBooking),
  amenityController.createBooking
);

// ── Cancel booking ────────────────────────────────────────────────────────────
router.patch(
  "/bookings/:bookingId/cancel",
  validate(v.cancelBooking),
  amenityController.cancelBooking
);

// ── Confirm / reject pending booking (amenities:write) ───────────────────────
router.patch(
  "/bookings/:bookingId/confirm",
  requirePermission("amenities", "write"),
  validate(v.reviewBooking),
  amenityController.confirmBooking
);
router.patch(
  "/bookings/:bookingId/reject",
  requirePermission("amenities", "write"),
  validate(v.reviewBooking),
  amenityController.rejectBooking
);

module.exports = router;
const express = require("express");
const router = express.Router();
const amenityController = require("../controllers/amenity.controller");
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { amenity: v } = require("../validators/phase2.validator");
const { actionLimiter } = require("../middlewares/rateLimiter.middleware");

router.use(protect, requireSociety);

// ── Amenity management (admin) ────────────────────────────────────────────────
router.post("/",           requireRole("admin"), validate(v.createAmenity), amenityController.create);
router.patch("/:id",       requireRole("admin"), validate(v.updateAmenity), amenityController.update);
router.delete("/:id",      requireRole("admin"), amenityController.deactivate);

// ── Amenity listing (all) ─────────────────────────────────────────────────────
router.get("/",    amenityController.getAll);
router.get("/:id", amenityController.getOne);

// ── Slot availability — ?date=YYYY-MM-DD ──────────────────────────────────────
router.get("/:id/availability", amenityController.getAvailability);

// ── Bookings: admin views all ─────────────────────────────────────────────────
router.get("/bookings/all",  requireRole("admin"), amenityController.getAllBookings);

// ── Bookings: resident views own ──────────────────────────────────────────────
router.get("/bookings/mine", amenityController.getMyBookings);

// ── Single booking (both, role-scoped in service) ────────────────────────────
router.get("/bookings/:bookingId", amenityController.getBookingById);

// ── Create booking (resident) ─────────────────────────────────────────────────
router.post(
  "/bookings",
  actionLimiter,
  validate(v.createBooking),
  amenityController.createBooking
);

// ── Cancel booking (resident or admin) ───────────────────────────────────────
router.patch(
  "/bookings/:bookingId/cancel",
  validate(v.cancelBooking),
  amenityController.cancelBooking
);

// ── Admin: confirm / reject pending booking ───────────────────────────────────
router.patch(
  "/bookings/:bookingId/confirm",
  requireRole("admin"),
  validate(v.reviewBooking),
  amenityController.confirmBooking
);
router.patch(
  "/bookings/:bookingId/reject",
  requireRole("admin"),
  validate(v.reviewBooking),
  amenityController.rejectBooking
);

module.exports = router;

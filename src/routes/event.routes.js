const express = require("express");
const router = express.Router();
const eventController = require("../controllers/event.controller");
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { event: v } = require("../validators/phase2.validator");
const { actionLimiter } = require("../middlewares/rateLimiter.middleware");

router.use(protect, requireSociety);

// ── Admin: event lifecycle ────────────────────────────────────────────────────
router.post("/",              requireRole("admin"), validate(v.create),  eventController.create);
router.patch("/:id",          requireRole("admin"), validate(v.update),  eventController.update);
router.patch("/:id/publish",  requireRole("admin"),                      eventController.publish);
router.patch("/:id/cancel",   requireRole("admin"), validate(v.cancel),  eventController.cancel);

// ── Listing (residents see published only) ─────────────────────────────────────
router.get("/",    eventController.getAll);
router.get("/:id", eventController.getOne);

// ── RSVP (residents) ──────────────────────────────────────────────────────────
router.post(   "/:id/rsvp", actionLimiter, validate(v.rsvp), eventController.rsvp);
router.delete( "/:id/rsvp",                                   eventController.removeRsvp);

module.exports = router;

const express = require("express");
const router = express.Router();
const parkingController = require("../controllers/parking.controller");
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { parking: v } = require("../validators/phase2.validator");

router.use(protect, requireSociety);

// ─── SLOTS ────────────────────────────────────────────────────────────────────

// Summary of available/assigned counts by type (must come before /:slotId)
router.get("/slots/summary", parkingController.getAvailabilitySummary);

// Admin: create slots
router.post("/slots",       requireRole("admin"), validate(v.createSlot),      parkingController.createSlot);
router.post("/slots/bulk",  requireRole("admin"), validate(v.bulkCreateSlots), parkingController.bulkCreateSlots);

// All: list and view slots
router.get("/slots",           parkingController.getAllSlots);
router.get("/slots/:slotId",   parkingController.getSlotById);

// Admin: modify and release
router.patch( "/slots/:slotId",         requireRole("admin"), validate(v.updateSlot), parkingController.updateSlot);
router.patch( "/slots/:slotId/release", requireRole("admin"),                         parkingController.releaseSlot);

// ─── REQUESTS ─────────────────────────────────────────────────────────────────

// Resident: submit and manage own requests (must come before /requests/:requestId)
router.get(   "/requests/mine",              parkingController.getMyRequests);
router.post(  "/requests",                   validate(v.submitRequest), parkingController.submitRequest);
router.patch( "/requests/:requestId/cancel", parkingController.cancelRequest);

// Admin: list and act on all requests
router.get(   "/requests",                         requireRole("admin"), parkingController.getAllRequests);
router.patch( "/requests/:requestId/approve",      requireRole("admin"), validate(v.approveRequest), parkingController.approveRequest);
router.patch( "/requests/:requestId/reject",       requireRole("admin"), validate(v.rejectRequest),  parkingController.rejectRequest);

module.exports = router;

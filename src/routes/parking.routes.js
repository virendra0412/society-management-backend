const express = require("express");
const router = express.Router();
const parkingController = require("../controllers/parking.controller");
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { parking: v } = require("../validators/phase2.validator");

router.use(protect, requireSociety);

// ─── SLOTS ────────────────────────────────────────────────────────────────────

// Summary of available/assigned counts (all users)
router.get("/slots/summary", parkingController.getAvailabilitySummary);

// Parking committee / Admin: create slots
router.post("/slots",      requirePermission("parking", "write"), validate(v.createSlot),      parkingController.createSlot);
router.post("/slots/bulk", requirePermission("parking", "write"), validate(v.bulkCreateSlots), parkingController.bulkCreateSlots);

// All: list and view slots
router.get("/slots",         parkingController.getAllSlots);
router.get("/slots/:slotId", parkingController.getSlotById);

// Parking committee / Admin: modify and release
router.patch("/slots/:slotId",         requirePermission("parking", "write"), validate(v.updateSlot), parkingController.updateSlot);
router.patch("/slots/:slotId/release", requirePermission("parking", "write"),                         parkingController.releaseSlot);

// ─── REQUESTS ─────────────────────────────────────────────────────────────────

// Resident: submit and manage own requests
router.get(   "/requests/mine",              parkingController.getMyRequests);
router.post(  "/requests",                   validate(v.submitRequest), parkingController.submitRequest);
router.patch( "/requests/:requestId/cancel", parkingController.cancelRequest);

// Parking committee / Admin: list and act on all requests
router.get(   "/requests",                         requirePermission("parking", "read"),  parkingController.getAllRequests);
router.patch( "/requests/:requestId/approve",      requirePermission("parking", "write"), validate(v.approveRequest), parkingController.approveRequest);
router.patch( "/requests/:requestId/reject",       requirePermission("parking", "write"), validate(v.rejectRequest),  parkingController.rejectRequest);

module.exports = router;
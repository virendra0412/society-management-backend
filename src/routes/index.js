const express = require("express");
const router = express.Router();

// ─── Phase 1 Routes ───────────────────────────────────────────────────────────
const authRoutes    = require("./auth.routes");
const userRoutes    = require("./user.routes");
const issueRoutes   = require("./issue.routes");
const {
  helpRouter,
  noticeRouter,
  pollRouter,
  contactRouter,
} = require("./resource.routes");

// ─── Phase 2 Routes ───────────────────────────────────────────────────────────
const visitorRoutes     = require("./visitor.routes");
const maintenanceRoutes = require("./maintenance.routes");
const amenityRoutes     = require("./amenity.routes");
const eventRoutes       = require("./event.routes");
const parkingRoutes     = require("./parking.routes");

// ─── Mount All Routes ─────────────────────────────────────────────────────────
router.use("/auth",        authRoutes);
router.use("/users",       userRoutes);
router.use("/issues",      issueRoutes);
router.use("/help",        helpRouter);
router.use("/notices",     noticeRouter);
router.use("/polls",       pollRouter);
router.use("/contacts",    contactRouter);

// Phase 2 — Visitor & Maintenance
router.use("/visitors",    visitorRoutes);
router.use("/maintenance", maintenanceRoutes);

// Phase 2 — Amenity, Events, Parking
router.use("/amenities",   amenityRoutes);
router.use("/events",      eventRoutes);
router.use("/parking",     parkingRoutes);

module.exports = router;

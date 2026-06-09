/**
 * routes/inviteLink.routes.js
 *
 * Mounted at /api/v1 in routes/index.js — see MOUNT INSTRUCTIONS below.
 *
 * Routes:
 *   POST /society/:id/invite-link           — admin generates invite link
 *   GET  /invite-link/verify?token=TOKEN    — public token pre-check
 *
 * ─── MOUNT INSTRUCTIONS (routes/index.js) ────────────────────────────────────
 * Add these two lines in the appropriate sections:
 *
 *   // near the top with other requires:
 *   const { inviteRouter, inviteVerifyRouter } = require("./inviteLink.routes");
 *
 *   // in the mount section (no module gate needed — this is core onboarding):
 *   router.use("/society",      protect, requireSociety, requireRole("admin"), inviteRouter);
 *   router.use("/invite-link",  inviteVerifyRouter);   // public — no protect
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express               = require("express");
const inviteLinkController  = require("../controllers/inviteLink.controller");
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requireRole }       = require("../middlewares/role.middleware");

// ─── Admin router (POST /society/:id/invite-link) ─────────────────────────────
const inviteRouter = express.Router({ mergeParams: true });

inviteRouter.post(
  "/:id/invite-link",
  protect,
  requireSociety,
  requireRole("admin"),
  inviteLinkController.generateInviteLink
);

// ─── Public router (GET /invite-link/verify) ─────────────────────────────────
const inviteVerifyRouter = express.Router();

inviteVerifyRouter.get(
  "/verify",
  inviteLinkController.verifyInviteToken
);

module.exports = { inviteRouter, inviteVerifyRouter };
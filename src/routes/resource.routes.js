const express = require("express");
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { actionLimiter } = require("../middlewares/rateLimiter.middleware");
const { help, notice, poll, contact } = require("../validators/resource.validator");
const {
  helpController,
  noticeController,
  pollController,
  contactController,
} = require("../controllers/resource.controller");

// ─── Help Routes ──────────────────────────────────────────────────────────────
const helpRouter = express.Router();
helpRouter.use(protect, requireSociety);

helpRouter.post("/", validate(help.create), helpController.create);
helpRouter.get("/", helpController.getAll);

// ── NEW: Single post with all replies ─────────────────────────────────────
helpRouter.get("/:id", helpController.getOne);

helpRouter.post("/:id/replies", validate(help.reply), helpController.addReply);

// ── NEW: Upvote a reply (toggle) ──────────────────────────────────────────
helpRouter.post("/:id/replies/:replyId/upvote", actionLimiter, helpController.upvoteReply);

// ── NEW: Close a help post (author or admin) ──────────────────────────────
helpRouter.patch("/:id/close", helpController.closePost);

// ─── Notice Routes ────────────────────────────────────────────────────────────
const noticeRouter = express.Router();
noticeRouter.use(protect, requireSociety);

noticeRouter.post("/", requireRole("admin"), validate(notice.create), noticeController.create);
noticeRouter.get("/", noticeController.getAll);

// ── Edit notice (admin) ───────────────────────────────────────────────────
noticeRouter.patch("/:id", requireRole("admin"), validate(notice.update), noticeController.updateNotice);

// ── NEW: Pin / unpin notice (admin) — validates { isPinned: boolean } body ──
noticeRouter.patch("/:id/pin", requireRole("admin"), validate(notice.pin), noticeController.setPinned);

// ── NEW: Delete notice (admin, soft-delete) ────────────────────────────────
noticeRouter.delete("/:id", requireRole("admin"), noticeController.deleteNotice);

// ─── Poll Routes ──────────────────────────────────────────────────────────────
const pollRouter = express.Router();
pollRouter.use(protect, requireSociety);

pollRouter.post("/", requireRole("admin"), validate(poll.create), pollController.create);
pollRouter.get("/", pollController.getAll);
pollRouter.post("/:id/vote", actionLimiter, validate(poll.vote), pollController.vote);

// ── NEW: Admin manually close a poll ──────────────────────────────────────
pollRouter.patch("/:id/close", requireRole("admin"), pollController.closePoll);

// ─── Contact Routes ───────────────────────────────────────────────────────────
const contactRouter = express.Router();
contactRouter.use(protect, requireSociety);

contactRouter.get("/", contactController.getAll);
contactRouter.post("/", requireRole("admin"), validate(contact.create), contactController.create);

// ── NEW: Edit and delete contact (admin) ──────────────────────────────────
contactRouter.patch("/:id", requireRole("admin"), validate(contact.update), contactController.update);
contactRouter.delete("/:id", requireRole("admin"), contactController.remove);

module.exports = { helpRouter, noticeRouter, pollRouter, contactRouter };
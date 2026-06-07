const express = require("express");
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/role.middleware");
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
helpRouter.get("/:id", helpController.getOne);
helpRouter.post("/:id/replies", validate(help.reply), helpController.addReply);
helpRouter.post("/:id/replies/:replyId/upvote", actionLimiter, helpController.upvoteReply);
helpRouter.patch("/:id/close", helpController.closePost);

// ─── Notice Routes ────────────────────────────────────────────────────────────
const noticeRouter = express.Router();
noticeRouter.use(protect, requireSociety);

// notices:write → Admin, Secretary, Maintenance Head
noticeRouter.post("/",      requirePermission("notices", "write"), validate(notice.create), noticeController.create);
noticeRouter.get("/", noticeController.getAll);
noticeRouter.patch("/:id",     requirePermission("notices", "write"), validate(notice.update), noticeController.updateNotice);
noticeRouter.patch("/:id/pin", requirePermission("notices", "write"), validate(notice.pin),    noticeController.setPinned);
noticeRouter.delete("/:id",    requirePermission("notices", "write"),                          noticeController.deleteNotice);

// ─── Poll Routes ──────────────────────────────────────────────────────────────
const pollRouter = express.Router();
pollRouter.use(protect, requireSociety);

// notices:write covers polls too (same editorial permission)
pollRouter.post("/",         requirePermission("notices", "write"), validate(poll.create), pollController.create);
pollRouter.get("/", pollController.getAll);
pollRouter.post("/:id/vote", actionLimiter, validate(poll.vote), pollController.vote);
pollRouter.patch("/:id/close", requirePermission("notices", "write"), pollController.closePoll);

// ─── Contact Routes ───────────────────────────────────────────────────────────
const contactRouter = express.Router();
contactRouter.use(protect, requireSociety);

contactRouter.get("/", contactController.getAll);
// residents:write → Admin manages committee directory
contactRouter.post("/",    requirePermission("residents", "write"), validate(contact.create), contactController.create);
contactRouter.patch("/:id", requirePermission("residents", "write"), validate(contact.update), contactController.update);
contactRouter.delete("/:id", requirePermission("residents", "write"),                          contactController.remove);

module.exports = { helpRouter, noticeRouter, pollRouter, contactRouter };
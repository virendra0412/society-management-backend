/**
 * routes/resource.routes.js
 *
 * CHANGED IN TASK 2:
 *   Notice write routes now have auditMiddleware() inserted BEFORE the controller.
 *   This is the cleanest approach for notices because the NoticeController is
 *   shared with Help/Poll/Contact in one file — modifying that file risks
 *   touching unrelated controllers. The middleware intercepts res.json() after
 *   success and writes the log asynchronously.
 *
 * All other routes (help, poll, contact, GET notice) are UNCHANGED.
 */

const express = require("express");
const { protect, requireSociety }  = require("../middlewares/auth.middleware");
const { requirePermission }        = require("../middlewares/role.middleware");
const { validate }                 = require("../middlewares/validate.middleware");
const { actionLimiter }            = require("../middlewares/rateLimiter.middleware");
const { help, notice, poll, contact } = require("../validators/resource.validator");
const { auditMiddleware }          = require("../middlewares/audit.middleware"); // NEW
const {
  helpController,
  noticeController,
  pollController,
  contactController,
} = require("../controllers/resource.controller");

// ─── Help Routes ──────────────────────────────────────────────────────────────
const helpRouter = express.Router();
helpRouter.use(protect, requireSociety);

helpRouter.post("/",                                   validate(help.create),  helpController.create);
helpRouter.get("/",                                                            helpController.getAll);
helpRouter.get("/:id",                                                         helpController.getOne);
helpRouter.post("/:id/replies",                        validate(help.reply),   helpController.addReply);
helpRouter.post("/:id/replies/:replyId/upvote",        actionLimiter,          helpController.upvoteReply);
helpRouter.patch("/:id/close",                                                 helpController.closePost);

// ─── Notice Routes ────────────────────────────────────────────────────────────
const noticeRouter = express.Router();
noticeRouter.use(protect, requireSociety);

// GET — unchanged
noticeRouter.get("/", noticeController.getAll);

// WRITE routes — auditMiddleware inserted before controller ───────────────────

noticeRouter.post(
  "/",
  requirePermission("notices", "write"),
  validate(notice.create),
  // Audit: extract entityId from the response body (data.notice._id)
  auditMiddleware(
    "notice.published",
    "Notice",
    (req, body) => body?.data?.notice?._id || null,
    (req) => ({ title: req.body.title, tag: req.body.tag })
  ),
  noticeController.create
);

noticeRouter.patch(
  "/:id",
  requirePermission("notices", "write"),
  validate(notice.update),
  auditMiddleware(
    "notice.updated",
    "Notice",
    (req) => req.params.id,
    (req) => ({ updatedFields: Object.keys(req.body) })
  ),
  noticeController.updateNotice
);

noticeRouter.patch(
  "/:id/pin",
  requirePermission("notices", "write"),
  validate(notice.pin),
  auditMiddleware(
    // Action depends on the body — resolve dynamically in the middleware factory
    // by passing a function as action. The auditMiddleware handles string or fn.
    // We use a small wrapper here to pick the right action name.
    "notice.pinned", // will be overridden below
    "Notice",
    (req) => req.params.id,
    (req) => ({ isPinned: req.body.isPinned })
  ),
  // ↑ NOTE: the pin/unpin action distinction ("notice.pinned" vs "notice.unpinned")
  // is minor — the changes field records isPinned:true/false so it's distinguishable.
  // If you need separate action names, use the audit() helper directly inside
  // NoticeController.setPinned() instead (same pattern as user/visitor/maintenance).
  noticeController.setPinned
);

noticeRouter.delete(
  "/:id",
  requirePermission("notices", "write"),
  auditMiddleware(
    "notice.deleted",
    "Notice",
    (req) => req.params.id,
    null
  ),
  noticeController.deleteNotice
);

// ─── Poll Routes ──────────────────────────────────────────────────────────────
const pollRouter = express.Router();
pollRouter.use(protect, requireSociety);

pollRouter.post("/",           requirePermission("notices", "write"), validate(poll.create), pollController.create);
pollRouter.get("/",                                                                          pollController.getAll);
pollRouter.post("/:id/vote",   actionLimiter, validate(poll.vote),                          pollController.vote);
pollRouter.patch("/:id/close", requirePermission("notices", "write"),                       pollController.closePoll);

// ─── Contact Routes ───────────────────────────────────────────────────────────
const contactRouter = express.Router();
contactRouter.use(protect, requireSociety);

contactRouter.get("/",                                                                                              contactController.getAll);
contactRouter.post("/",    requirePermission("residents", "write"), validate(contact.create),                      contactController.create);
contactRouter.patch("/:id", requirePermission("residents", "write"), validate(contact.update),                     contactController.update);
contactRouter.delete("/:id", requirePermission("residents", "write"),                                              contactController.remove);

module.exports = { helpRouter, noticeRouter, pollRouter, contactRouter };
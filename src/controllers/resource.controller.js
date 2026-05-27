const { helpService, noticeService, pollService, contactService } = require("../services/resource.service");
const { sendSuccess } = require("../utils/response");

// ─── Help Controller ──────────────────────────────────────────────────────────
class HelpController {
  async create(req, res) {
    const post = await helpService.create(req.body, req.user);
    return sendSuccess(res, { statusCode: 201, message: "Help request posted.", data: { post } });
  }

  async getAll(req, res) {
    const { posts, meta } = await helpService.getAll(req.societyId, req.query);
    return sendSuccess(res, { data: { posts }, meta });
  }

  // ── NEW: Get single help post with all replies ─────────────────────────────
  async getOne(req, res) {
    const post = await helpService.getOne(req.params.id, req.user);
    return sendSuccess(res, { data: { post } });
  }

  async addReply(req, res) {
    const post = await helpService.addReply(req.params.id, req.body, req.user);
    return sendSuccess(res, { statusCode: 201, message: "Reply added.", data: { replies: post.replies } });
  }

  // ── NEW: Upvote a reply ────────────────────────────────────────────────────
  async upvoteReply(req, res) {
    await helpService.upvoteReply(req.params.id, req.params.replyId, req.user);
    return sendSuccess(res, { message: "Upvote toggled." });
  }

  // ── NEW: Close a help post ─────────────────────────────────────────────────
  async closePost(req, res) {
    const post = await helpService.closePost(req.params.id, req.user);
    return sendSuccess(res, { message: "Help post closed.", data: { post } });
  }
}

// ─── Notice Controller ────────────────────────────────────────────────────────
class NoticeController {
  async create(req, res) {
    const notice = await noticeService.create(req.body, req.user);
    return sendSuccess(res, { statusCode: 201, message: "Notice posted.", data: { notice } });
  }

  async getAll(req, res) {
    const { notices, meta } = await noticeService.getAll(req.societyId, req.query);
    return sendSuccess(res, { data: { notices }, meta });
  }

  // ── NEW: Pin / unpin a notice ──────────────────────────────────────────────
  async setPinned(req, res) {
    const isPinned = req.body.isPinned === true || req.body.isPinned === "true";
    const notice = await noticeService.setPinned(req.params.id, isPinned, req.user);
    return sendSuccess(res, {
      message: isPinned ? "Notice pinned." : "Notice unpinned.",
      data: { notice },
    });
  }

  // ── NEW: Soft-delete a notice ──────────────────────────────────────────────
  async deleteNotice(req, res) {
    await noticeService.deleteNotice(req.params.id, req.user);
    return sendSuccess(res, { message: "Notice deleted." });
  }
}

// ─── Poll Controller ──────────────────────────────────────────────────────────
class PollController {
  async create(req, res) {
    const poll = await pollService.create(req.body, req.user);
    return sendSuccess(res, { statusCode: 201, message: "Poll created.", data: { poll } });
  }

  async getAll(req, res) {
    const { polls, meta } = await pollService.getAll(req.societyId, req.query);
    return sendSuccess(res, { data: { polls }, meta });
  }

  async vote(req, res) {
    const poll = await pollService.vote(req.params.id, req.body, req.user);
    return sendSuccess(res, { message: "Vote recorded.", data: { poll } });
  }

  // ── NEW: Admin manually close a poll ──────────────────────────────────────
  async closePoll(req, res) {
    const poll = await pollService.closePoll(req.params.id, req.user);
    return sendSuccess(res, { message: "Poll closed.", data: { poll } });
  }
}

// ─── Contact Controller ───────────────────────────────────────────────────────
class ContactController {
  async getAll(req, res) {
    const contacts = await contactService.getAll(req.societyId);
    return sendSuccess(res, { data: { contacts } });
  }

  async create(req, res) {
    const contact = await contactService.create(req.body, req.user);
    return sendSuccess(res, { statusCode: 201, message: "Contact added.", data: { contact } });
  }

  // ── NEW: Edit a contact ────────────────────────────────────────────────────
  async update(req, res) {
    const contact = await contactService.update(req.params.id, req.body, req.user);
    return sendSuccess(res, { message: "Contact updated.", data: { contact } });
  }

  // ── NEW: Delete a contact ──────────────────────────────────────────────────
  async remove(req, res) {
    await contactService.remove(req.params.id, req.user);
    return sendSuccess(res, { message: "Contact deleted." });
  }
}

module.exports = {
  helpController: new HelpController(),
  noticeController: new NoticeController(),
  pollController: new PollController(),
  contactController: new ContactController(),
};

const helpRepository    = require("../repositories/help.repository");
const noticeRepository  = require("../repositories/notice.repository");
const pollRepository    = require("../repositories/poll.repository");
const contactRepository = require("../repositories/contact.repository");
const userRepository    = require("../repositories/user.repository");
const { notifyNewNotice } = require("../utils/notification");
const AppError = require("../utils/AppError");
const { parsePagination, buildPaginationMeta, parseSort } = require("../utils/pagination");

// ─── Help Service ─────────────────────────────────────────────────────────────
class HelpService {
  _getSocietyId(user) {
    return user.society?._id || user.society;
  }

  async create(data, user) {
    return helpRepository.create({
      ...data,
      society: this._getSocietyId(user),
      author: user._id,
      flat: user.flat,
    });
  }

  async getAll(societyId, query) {
    const { page, limit, skip } = parsePagination(query);
    const sort = parseSort(query.sort, ["createdAt"]);
    const filters = {};
    if (query.category) filters.category = query.category;
    if (query.isClosed !== undefined) filters.isClosed = query.isClosed === "true";

    const { posts, total } = await helpRepository.findBySociety(societyId, filters, { skip, limit }, sort);
    return { posts, meta: buildPaginationMeta({ total, page, limit }) };
  }

  // ── NEW: Get a single post with all replies ────────────────────────────────
  async getOne(helpId, requestingUser) {
    const post = await helpRepository.findById(helpId);
    if (!post) throw AppError.notFound("Help post not found.");
    const societyId = this._getSocietyId(requestingUser);
    if (post.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    return post;
  }

  async addReply(helpId, data, user) {
    const post = await helpRepository.findById(helpId);
    if (!post) throw AppError.notFound("Help post not found.");
    if (post.isClosed) throw AppError.badRequest("This help post is closed for replies.");

    const societyId = this._getSocietyId(user);
    if (post.society.toString() !== societyId?.toString()) throw AppError.forbidden();

    return helpRepository.addReply(helpId, { ...data, author: user._id });
  }

  // ── NEW: Upvote a reply ────────────────────────────────────────────────────
  async upvoteReply(helpId, replyId, user) {
    const post = await helpRepository.findById(helpId);
    if (!post) throw AppError.notFound("Help post not found.");

    const societyId = this._getSocietyId(user);
    if (post.society.toString() !== societyId?.toString()) throw AppError.forbidden();

    const reply = post.replies?.id(replyId);
    if (!reply) throw AppError.notFound("Reply not found.");

    return helpRepository.upvoteReply(helpId, replyId, user._id);
  }

  // ── NEW: Close / reopen a help post ───────────────────────────────────────
  async closePost(helpId, user) {
    const post = await helpRepository.findById(helpId);
    if (!post) throw AppError.notFound("Help post not found.");

    const societyId = this._getSocietyId(user);
    if (post.society.toString() !== societyId?.toString()) throw AppError.forbidden();

    // Only the author or an admin can close a post
    const isAuthor = post.author._id.toString() === user._id.toString();
    if (!isAuthor && user.role !== "admin") {
      throw AppError.forbidden("Only the post author or an admin can close this post.");
    }

    return helpRepository.setClosedState(helpId, true);
  }
}

// ─── Notice Service ───────────────────────────────────────────────────────────
class NoticeService {
  async create(data, user) {
    const societyId = user.society?._id || user.society;
    const notice = await noticeRepository.create({
      ...data,
      society:  societyId,
      postedBy: user._id,
    });

    // Fan-out push notification to all approved society members (fire-and-forget)
    // Wrapped in setImmediate so it doesn't block the HTTP response
    setImmediate(async () => {
      try {
        const tokens = await userRepository.getFcmTokensBySociety(societyId);
        await notifyNewNotice(tokens, notice);
      } catch (_) {
        // Notification failure must never affect the API response
      }
    });

    return notice;
  }

  async getAll(societyId, query) {
    const { page, limit, skip } = parsePagination(query);
    const filters = {};
    if (query.tag) filters.tag = query.tag;
    if (query.isPinned !== undefined) filters.isPinned = query.isPinned === "true";

    const { notices, total } = await noticeRepository.findBySociety(societyId, { skip, limit }, filters);
    return { notices, meta: buildPaginationMeta({ total, page, limit }) };
  }

  // ── NEW: Pin / unpin a notice ──────────────────────────────────────────────
  async setPinned(noticeId, isPinned, adminUser) {
    const notice = await noticeRepository.findById(noticeId);
    if (!notice) throw AppError.notFound("Notice not found.");

    const adminSocietyId = adminUser.society?._id || adminUser.society;
    if (notice.society.toString() !== adminSocietyId?.toString()) throw AppError.forbidden();

    return noticeRepository.setPinned(noticeId, isPinned);
  }

  // ── NEW: Edit a notice ────────────────────────────────────────────────────
  async updateNotice(noticeId, updates, adminUser) {
    const notice = await noticeRepository.findById(noticeId);
    if (!notice) throw AppError.notFound("Notice not found.");

    const adminSocietyId = adminUser.society?._id || adminUser.society;
    if (notice.society.toString() !== adminSocietyId?.toString()) throw AppError.forbidden();

    return noticeRepository.updateById(noticeId, updates);
  }

  // ── NEW: Soft-delete a notice ──────────────────────────────────────────────
  async deleteNotice(noticeId, adminUser) {
    const notice = await noticeRepository.findById(noticeId);
    if (!notice) throw AppError.notFound("Notice not found.");

    const adminSocietyId = adminUser.society?._id || adminUser.society;
    if (notice.society.toString() !== adminSocietyId?.toString()) throw AppError.forbidden();

    return noticeRepository.softDelete(noticeId);
  }
}

// ─── Poll Service ─────────────────────────────────────────────────────────────
class PollService {
  async create(data, user) {
    const societyId = user.society?._id || user.society;
    return pollRepository.create({
      ...data,
      society: societyId,
      createdBy: user._id,
    });
  }

  async getAll(societyId, query, userId) {
    const { page, limit, skip } = parsePagination(query);
    // findBySociety now uses +voters projection so we can compute myVote
    const { polls, total } = await pollRepository.findBySociety(societyId, { skip, limit });

    // Inject myVote: the option _id the requesting user voted for, or null.
    // voters is stripped in toJSON but we read it before serialisation here.
    const annotated = polls.map((poll) => {
      const obj = poll.toObject({ getters: true });
      obj.myVote = null;
      if (userId) {
        for (const opt of poll.options) {
          const voterIds = opt.voters || [];
          if (voterIds.some((v) => v.toString() === userId.toString())) {
            obj.myVote = opt._id;
            break;
          }
        }
      }
      // Strip voters from each option before sending to client
      obj.options = obj.options.map(({ voters: _v, ...rest }) => rest);
      return obj;
    });

    return { polls: annotated, meta: buildPaginationMeta({ total, page, limit }) };
  }

  async vote(pollId, { optionId }, user) {
    const societyId = user.society?._id || user.society;

    const poll = await pollRepository.findById(pollId);
    if (!poll) throw AppError.notFound("Poll not found.");
    if (poll.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    if (poll.isClosed) throw AppError.badRequest("This poll is closed.");

    if (poll.closesAt && new Date() > poll.closesAt) {
      await pollRepository.closePoll(pollId);
      throw AppError.badRequest("This poll has expired and is now closed.");
    }

    if (poll.hasUserVoted(user._id)) {
      throw AppError.conflict("You have already voted in this poll.", "ALREADY_VOTED");
    }

    const optionExists = poll.options.some((o) => o._id.toString() === optionId);
    if (!optionExists) throw AppError.badRequest("Invalid option ID.");

    const updated = await pollRepository.castVote(pollId, optionId, user._id);
    if (!updated) {
      throw AppError.conflict("You have already voted in this poll.", "ALREADY_VOTED");
    }

    return updated;
  }

  // ── NEW: Admin manually close a poll ──────────────────────────────────────
  async closePoll(pollId, adminUser) {
    const poll = await pollRepository.findById(pollId);
    if (!poll) throw AppError.notFound("Poll not found.");

    const adminSocietyId = adminUser.society?._id || adminUser.society;
    if (poll.society.toString() !== adminSocietyId?.toString()) throw AppError.forbidden();
    if (poll.isClosed) throw AppError.badRequest("Poll is already closed.");

    return pollRepository.closePoll(pollId);
  }
}

// ─── Contact Service ──────────────────────────────────────────────────────────
class ContactService {
  async getAll(societyId) {
    const contacts = await contactRepository.findBySociety(societyId);
    const grouped = contacts.reduce((acc, c) => {
      const g = c.group;
      if (!acc[g]) acc[g] = [];
      acc[g].push(c);
      return acc;
    }, {});
    return grouped;
  }

  async create(data, user) {
    const societyId = user.society?._id || user.society;
    return contactRepository.create({ ...data, society: societyId, addedBy: user._id });
  }

  // ── NEW: Edit a contact ────────────────────────────────────────────────────
  async update(contactId, updates, adminUser) {
    const contact = await contactRepository.findById(contactId);
    if (!contact) throw AppError.notFound("Contact not found.");

    const adminSocietyId = adminUser.society?._id || adminUser.society;
    if (contact.society.toString() !== adminSocietyId?.toString()) throw AppError.forbidden();

    return contactRepository.updateById(contactId, updates);
  }

  // ── NEW: Delete a contact (soft-delete) ───────────────────────────────────
  async remove(contactId, adminUser) {
    const contact = await contactRepository.findById(contactId);
    if (!contact) throw AppError.notFound("Contact not found.");

    const adminSocietyId = adminUser.society?._id || adminUser.society;
    if (contact.society.toString() !== adminSocietyId?.toString()) throw AppError.forbidden();

    return contactRepository.deleteById(contactId);
  }
}

module.exports = {
  helpService: new HelpService(),
  noticeService: new NoticeService(),
  pollService: new PollService(),
  contactService: new ContactService(),
};
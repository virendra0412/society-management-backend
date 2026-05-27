const Help = require("../models/help.model");

const AUTHOR_SELECT = "name flat role";

class HelpRepository {
  async create(data) {
    return Help.create(data);
  }

  async findById(id) {
    return Help.findById(id)
      .populate("author", AUTHOR_SELECT)
      .populate("replies.author", AUTHOR_SELECT)
      .exec();
  }

  async findBySociety(societyId, filters = {}, { skip, limit }, sort) {
    const query = { society: societyId, ...filters };
    const [posts, total] = await Promise.all([
      Help.find(query)
        .populate("author", AUTHOR_SELECT)
        .select("-replies")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Help.countDocuments(query),
    ]);
    return { posts, total };
  }

  async addReply(helpId, reply) {
    return Help.findByIdAndUpdate(
      helpId,
      { $push: { replies: reply } },
      { new: true }
    )
      .populate("replies.author", AUTHOR_SELECT)
      .exec();
  }

  async upvoteReply(helpId, replyId, userId) {
    const post = await Help.findById(helpId);
    const reply = post?.replies?.id(replyId);
    if (!reply) return null;

    const alreadyVoted = reply.upvotes.some((id) => id.toString() === userId.toString());
    const op = alreadyVoted ? "$pull" : "$addToSet";
    return Help.findOneAndUpdate(
      { _id: helpId, "replies._id": replyId },
      { [op]: { "replies.$.upvotes": userId } },
      { new: true }
    ).exec();
  }

  // ── NEW: Open or close a help post ────────────────────────────────────────
  async setClosedState(helpId, isClosed) {
    return Help.findByIdAndUpdate(
      helpId,
      { isClosed },
      { new: true }
    )
      .populate("author", AUTHOR_SELECT)
      .exec();
  }
}

module.exports = new HelpRepository();

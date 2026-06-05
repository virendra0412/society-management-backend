const Poll = require("../models/poll.model");
const mongoose = require("mongoose");

class PollRepository {
  async create(data) {
    return Poll.create(data);
  }

  async findBySociety(societyId, { skip, limit }) {
    const [polls, total] = await Promise.all([
      Poll.find({ society: societyId })
        .select("+options.voters")   // needed so service can compute myVote per user
        .populate("createdBy", "name role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Poll.countDocuments({ society: societyId }),
    ]);
    return { polls, total };
  }

  async findById(id) {
    // Include voters for vote checking
    return Poll.findById(id).select("+options.voters").exec();
  }

  /**
   * Atomically record a vote using MongoDB $inc to prevent race conditions.
   * Adds userId to voters array and increments vote count.
   */
  async castVote(pollId, optionId, userId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const poll = await Poll.findOneAndUpdate(
        {
          _id: pollId,
          "options._id": optionId,
          isClosed: false,
          // Reject if user already voted in ANY option
          "options.voters": { $nin: [userId] },
        },
        {
          $inc: {
            "options.$.votes": 1,
            totalVotes: 1,
          },
          $push: {
            "options.$.voters": userId,
          },
        },
        { new: true, session }
      );
      await session.commitTransaction();
      return poll;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  async closePoll(id) {
    return Poll.findByIdAndUpdate(id, { isClosed: true }, { new: true }).exec();
  }
}

module.exports = new PollRepository();
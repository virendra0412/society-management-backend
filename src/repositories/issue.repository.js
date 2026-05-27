const Issue = require("../models/issue.model");

const REPORTER_SELECT = "name flat role";

class IssueRepository {
  async create(data) {
    return Issue.create(data);
  }

  async findById(id) {
    return Issue.findById(id)
      .populate("reporter", REPORTER_SELECT)
      .populate("assignedTo", "name role")
      .populate("comments.author", REPORTER_SELECT)
      .exec();
  }

  async findBySociety(societyId, filters = {}, { skip, limit }, sort) {
    const query = { society: societyId, ...filters };
    const [issues, total] = await Promise.all([
      Issue.find(query)
        .populate("reporter", REPORTER_SELECT)
        .populate("assignedTo", "name role")
        .select("-comments")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Issue.countDocuments(query),
    ]);
    return { issues, total };
  }

  async updateById(id, updates) {
    return Issue.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    })
      .populate("reporter", REPORTER_SELECT)
      .exec();
  }

  async addComment(issueId, comment) {
    return Issue.findByIdAndUpdate(
      issueId,
      { $push: { comments: comment } },
      { new: true }
    )
      .populate("comments.author", REPORTER_SELECT)
      .exec();
  }

  // ── NEW: Append a Cloudinary photo URL to the photos array ────────────────
  async addPhoto(issueId, photoUrl) {
    return Issue.findByIdAndUpdate(
      issueId,
      { $push: { photos: photoUrl } },
      { new: true }
    ).exec();
  }

  async findUnescalatedStaleIssues(thresholdDate) {
    return Issue.find({
      status: { $in: ["Open", "In Progress"] },
      isEscalated: false,
      createdAt: { $lt: thresholdDate },
    })
      .populate("society", "name admin")
      .populate("reporter", "name flat")
      .select("title society reporter status createdAt")
      .exec();
  }

  async markEscalated(issueIds) {
    return Issue.updateMany(
      { _id: { $in: issueIds } },
      { isEscalated: true, escalatedAt: new Date() }
    ).exec();
  }
}

module.exports = new IssueRepository();

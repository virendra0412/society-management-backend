const issueRepository = require("../repositories/issue.repository");
const AppError = require("../utils/AppError");
const { parsePagination, buildPaginationMeta, parseSort } = require("../utils/pagination");
const { uploadToCloudinary } = require("../utils/cloudinary");

const ALLOWED_SORT_FIELDS = ["createdAt", "priority", "status", "updatedAt"];

class IssueService {
  async createIssue(data, user) {
    return issueRepository.create({
      ...data,
      society: user.society._id || user.society,
      reporter: user._id,
      flat: user.flat,
    });
  }

  // ── NEW: Upload photos for an issue ───────────────────────────────────────
  async uploadPhoto(issueId, file, user) {
    if (!file) throw AppError.badRequest("No image file provided.");

    const issue = await issueRepository.findById(issueId);
    if (!issue) throw AppError.notFound("Issue not found.");

    const societyId = user.society?._id || user.society;
    if (issue.society.toString() !== societyId?.toString()) throw AppError.forbidden();

    // Only reporter or admin can add photos
    const isReporter = issue.reporter._id?.toString() === user._id.toString();
    if (!isReporter && user.role !== "admin") {
      throw AppError.forbidden("Only the reporter or an admin can add photos.");
    }

    if (issue.photos.length >= 5) {
      throw AppError.badRequest("Maximum 5 photos per issue.");
    }

    const result = await uploadToCloudinary(file.buffer, {
      folder: `society-app/issues/${issueId}`,
      transformation: [{ width: 1200, height: 900, crop: "limit" }],
    });

    return issueRepository.addPhoto(issueId, result.secure_url);
  }

  async getIssues(societyId, query) {
    const { page, limit, skip } = parsePagination(query);
    const sort = parseSort(query.sort, ALLOWED_SORT_FIELDS);

    const filters = {};
    if (query.status) filters.status = query.status;
    if (query.category) filters.category = query.category;
    if (query.priority) filters.priority = query.priority;
    if (query.isEscalated === "true") filters.isEscalated = true;

    const { issues, total } = await issueRepository.findBySociety(
      societyId,
      filters,
      { skip, limit },
      sort
    );

    return { issues, meta: buildPaginationMeta({ total, page, limit }) };
  }

  async getIssueById(issueId, societyId) {
    const issue = await issueRepository.findById(issueId);
    if (!issue) throw AppError.notFound("Issue not found.");
    if (issue.society.toString() !== societyId.toString()) {
      throw AppError.forbidden("Access denied.");
    }
    return issue;
  }

  async updateIssue(issueId, updates, user) {
    const issue = await issueRepository.findById(issueId);
    if (!issue) throw AppError.notFound("Issue not found.");

    const societyId = user.society?._id || user.society;
    if (issue.society.toString() !== societyId?.toString()) {
      throw AppError.forbidden("Access denied.");
    }

    if (user.role !== "admin") {
      if (updates.status || updates.assignedTo || updates.assignedVendor) {
        throw AppError.forbidden("Only admins can update issue status or assignment.");
      }
      if (issue.reporter.toString() !== user._id.toString()) {
        throw AppError.forbidden("You can only edit your own issues.");
      }
    }

    return issueRepository.updateById(issueId, updates);
  }

  // ── NEW: Assign issue to an external vendor ─────────────────────────────
  async assignVendor(issueId, vendorData, adminUser) {
    const issue = await issueRepository.findById(issueId);
    if (!issue) throw AppError.notFound("Issue not found.");

    const societyId = adminUser.society?._id || adminUser.society;
    if (issue.society.toString() !== societyId?.toString()) throw AppError.forbidden();

    return issueRepository.updateById(issueId, { assignedVendor: vendorData });
  }

  async addComment(issueId, { body }, user) {
    const issue = await issueRepository.findById(issueId);
    if (!issue) throw AppError.notFound("Issue not found.");

    const societyId = user.society?._id || user.society;
    if (issue.society.toString() !== societyId?.toString()) {
      throw AppError.forbidden("Access denied.");
    }

    const comment = {
      author: user._id,
      body,
      isAdminReply: user.role === "admin",
    };

    return issueRepository.addComment(issueId, comment);
  }
}

module.exports = new IssueService();

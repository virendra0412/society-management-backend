const issueService = require("../services/issue.service");
const { sendSuccess } = require("../utils/response");
const { audit } = require("../middlewares/audit.middleware");

class IssueController {
  async create(req, res) {
    const issue = await issueService.createIssue(req.body, req.user, req.societyId);
    await audit(req, "issue.created", "Issue", issue._id, {
      title: issue.title,
      category: issue.category,
      priority: issue.priority,
    });
    return sendSuccess(res, {
      statusCode: 201,
      message: "Issue reported successfully.",
      data: { issue },
    });
  }

  async getAll(req, res) {
    const { issues, meta } = await issueService.getIssues(req.societyId, req.query);
    return sendSuccess(res, { data: { issues }, meta });
  }

  async getOne(req, res) {
    const issue = await issueService.getIssueById(req.params.id, req.societyId);
    return sendSuccess(res, { data: { issue } });
  }

  async update(req, res) {
    const { issue, auditMeta } = await issueService.updateIssue(
      req.params.id,
      req.body,
      req.user,
      req.societyId
    );
    const action = req.body.status ? "issue.status_updated" : "issue.updated";
    await audit(req, action, "Issue", issue._id, {
      ...auditMeta,
      updates: req.body,
    });
    return sendSuccess(res, { message: "Issue updated.", data: { issue } });
  }

  async addComment(req, res) {
    const issue = await issueService.addComment(req.params.id, req.body, req.user, req.societyId);
    await audit(req, "issue.comment_added", "Issue", issue._id, {
      isAdminReply: req.user.role === "admin",
    });
    return sendSuccess(res, {
      statusCode: 201,
      message: "Comment added.",
      data: { comments: issue.comments },
    });
  }

  // ── NEW: Upload a photo for an issue ──────────────────────────────────────
  async uploadPhoto(req, res) {
    const issue = await issueService.uploadPhoto(req.params.id, req.file, req.user, req.societyId);
    await audit(req, "issue.photo_uploaded", "Issue", issue._id, {
      photoCount: issue.photos.length,
    });
    return sendSuccess(res, {
      statusCode: 201,
      message: "Photo uploaded.",
      data: { photos: issue.photos },
    });
  }

  // ── NEW: Assign issue to an external vendor ────────────────────────────────
  async assignVendor(req, res) {
    const issue = await issueService.assignVendor(req.params.id, req.body, req.user);
    await audit(req, "issue.vendor_assigned", "Issue", issue._id, {
      vendor: req.body,
    });
    return sendSuccess(res, { message: "Vendor assigned.", data: { issue } });
  }
}

module.exports = new IssueController();

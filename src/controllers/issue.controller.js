const issueService = require("../services/issue.service");
const { sendSuccess } = require("../utils/response");

class IssueController {
  async create(req, res) {
    const issue = await issueService.createIssue(req.body, req.user);
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
    const issue = await issueService.updateIssue(req.params.id, req.body, req.user);
    return sendSuccess(res, { message: "Issue updated.", data: { issue } });
  }

  async addComment(req, res) {
    const issue = await issueService.addComment(req.params.id, req.body, req.user);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Comment added.",
      data: { comments: issue.comments },
    });
  }

  // ── NEW: Upload a photo for an issue ──────────────────────────────────────
  async uploadPhoto(req, res) {
    const issue = await issueService.uploadPhoto(req.params.id, req.file, req.user);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Photo uploaded.",
      data: { photos: issue.photos },
    });
  }

  // ── NEW: Assign issue to an external vendor ────────────────────────────────
  async assignVendor(req, res) {
    const issue = await issueService.assignVendor(req.params.id, req.body, req.user);
    return sendSuccess(res, { message: "Vendor assigned.", data: { issue } });
  }
}

module.exports = new IssueController();

const issueRepository = require("../repositories/issue.repository");
const userRepository  = require("../repositories/user.repository");
const AppError = require("../utils/AppError");
const { parsePagination, buildPaginationMeta, parseSort } = require("../utils/pagination");
const { uploadToCloudinary } = require("../utils/cloudinary");
const { sendPushNotification } = require("../utils/notification");

const ALLOWED_SORT_FIELDS = ["createdAt", "priority", "status", "updatedAt"];

// Human-readable labels for issue statuses
const STATUS_LABELS = {
  open:        "Open",
  in_progress: "In Progress",
  resolved:    "Resolved",
  closed:      "Closed",
};

class IssueService {
  async createIssue(data, user, societyId) {
    return issueRepository.create({
      ...data,
      society: societyId,
      reporter: user._id,
      flat: user.flat,
    });
  }

  // ── Upload photos for an issue ─────────────────────────────────────────────
  async uploadPhoto(issueId, file, user, societyId) {
    if (!file) throw AppError.badRequest("No image file provided.");

    const issue = await issueRepository.findById(issueId);
    if (!issue) throw AppError.notFound("Issue not found.");

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
    if (query.status && query.status !== "All")   filters.status   = query.status;
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

  async updateIssue(issueId, updates, user, societyId) {
    const issue = await issueRepository.findById(issueId);
    if (!issue) throw AppError.notFound("Issue not found.");

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

    const updated = await issueRepository.updateById(issueId, updates);
    const auditMeta = {
      before: {
        status: issue.status,
        assignedTo: issue.assignedTo,
        assignedVendor: issue.assignedVendor,
      },
      after: {
        status: updated.status,
        assignedTo: updated.assignedTo,
        assignedVendor: updated.assignedVendor,
      },
    };

    // Notify the reporter when an admin changes the status
    if (user.role === "admin" && updates.status && updates.status !== issue.status) {
      setImmediate(async () => {
        try {
          const reporter = await userRepository.findByIdWithFcm(issue.reporter._id || issue.reporter);
          if (reporter?.fcmToken) {
            const label = STATUS_LABELS[updates.status] || updates.status;
            await sendPushNotification(
              [reporter.fcmToken],
              {
                title: "🔧 Issue Update",
                body:  `Your issue "${issue.title}" has been marked as ${label}.`,
              },
              { type: "issue_update", issueId: issueId.toString(), status: updates.status }
            );
          }
        } catch (_) {
          // Never crash the request if notification fails
        }
      });
    }

    return { issue: updated, auditMeta };
  }

  // ── Assign issue to an external vendor ────────────────────────────────────
  async assignVendor(issueId, vendorData, adminUser, societyId) {
    const issue = await issueRepository.findById(issueId);
    if (!issue) throw AppError.notFound("Issue not found.");

    if (issue.society.toString() !== societyId?.toString()) throw AppError.forbidden();

    return issueRepository.updateById(issueId, { assignedVendor: vendorData });
  }

  async addComment(issueId, { body }, user, societyId) {
    const issue = await issueRepository.findById(issueId);
    if (!issue) throw AppError.notFound("Issue not found.");

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

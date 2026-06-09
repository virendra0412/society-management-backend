/**
 * controllers/auditLog.controller.js
 *
 * GET /audit-logs          — paginated list for society admin
 * GET /audit-logs/summary  — action counts grouped by type (last 30 days)
 *
 * Admin-only. Never exposes logs from other societies.
 */

const AuditLog    = require("../models/auditLog.model");
const { sendSuccess } = require("../utils/response");
const AppError    = require("../utils/AppError");

// Default page size
const DEFAULT_LIMIT = 30;
const MAX_LIMIT     = 100;

class AuditLogController {
  /**
   * GET /audit-logs
   * Query params: page, limit, action, userId, entity, from, to
   */
  async getLogs(req, res) {
    const societyId = req.societyId;
    if (!societyId) throw AppError.forbidden("Society context required.");

    const {
      page   = 1,
      limit  = DEFAULT_LIMIT,
      action,
      userId,
      entity,
      from,
      to,
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit, 10) || DEFAULT_LIMIT, MAX_LIMIT);
    const parsedPage  = Math.max(parseInt(page,  10) || 1, 1);
    const skip        = (parsedPage - 1) * parsedLimit;

    // ── Build filter ──────────────────────────────────────────────────────────
    const filter = { societyId };

    if (action) filter.action = action;
    if (entity) filter.entity = entity;
    if (userId) filter.userId = userId;

    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to)   filter.timestamp.$lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate("userId", "name email")  // basic user info for display
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return sendSuccess(res, {
      data: { logs },
      meta: {
        total,
        page:       parsedPage,
        limit:      parsedLimit,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  }

  /**
   * GET /audit-logs/summary
   * Returns action counts for the last 30 days, grouped by action name.
   * Used for a simple activity overview card in the admin panel.
   */
  async getSummary(req, res) {
    const societyId = req.societyId;
    if (!societyId) throw AppError.forbidden("Society context required.");

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const summary = await AuditLog.aggregate([
      { $match: { societyId: societyId, timestamp: { $gte: since } } },
      { $group: { _id: "$action", count: { $sum: 1 } } },
      { $sort:  { count: -1 } },
      { $project: { _id: 0, action: "$_id", count: 1 } },
    ]);

    return sendSuccess(res, {
      data: { summary, since: since.toISOString() },
    });
  }
}

module.exports = new AuditLogController();
const cron = require("node-cron");
const issueRepository = require("../repositories/issue.repository");
const logger = require("../utils/logger");
const { escalationThresholdHours } = require("../config/env");

/**
 * Escalation Job — runs every hour.
 *
 * Finds issues that:
 *   - Are still Open or In Progress
 *   - Have not yet been escalated
 *   - Were created more than ESCALATION_THRESHOLD_HOURS ago
 *
 * Marks them as escalated and logs them for admin notification.
 * In production, replace the logger calls with actual notifications
 * (push notification, email, SMS via Twilio, etc.)
 */
const runEscalation = async () => {
  logger.info("[Escalation Job] Starting run...");

  try {
    const threshold = new Date(
      Date.now() - escalationThresholdHours * 60 * 60 * 1000
    );

    const staleIssues = await issueRepository.findUnescalatedStaleIssues(threshold);

    if (staleIssues.length === 0) {
      logger.info("[Escalation Job] No stale issues found.");
      return;
    }

    const issueIds = staleIssues.map((i) => i._id);
    await issueRepository.markEscalated(issueIds);

    // ── Notification hook ─────────────────────────────────────────────────
    // TODO: In production, send push notifications or emails here.
    // Group by society to send one digest per admin, not per issue.
    const bySociety = staleIssues.reduce((acc, issue) => {
      const sid = issue.society._id.toString();
      if (!acc[sid]) {
        acc[sid] = {
          societyName: issue.society.name,
          adminId: issue.society.admin,
          issues: [],
        };
      }
      acc[sid].issues.push({
        id: issue._id,
        title: issue.title,
        reporter: issue.reporter?.name,
        flat: issue.reporter?.flat,
        status: issue.status,
        age: Math.floor((Date.now() - issue.createdAt) / (1000 * 60 * 60)),
      });
      return acc;
    }, {});

    for (const [societyId, data] of Object.entries(bySociety)) {
      logger.warn(`[Escalation Job] ${data.issues.length} escalated issue(s) in society '${data.societyName}'`, {
        societyId,
        adminId: data.adminId,
        issues: data.issues.map((i) => `${i.title} (${i.age}h old)`),
      });
      // await notificationService.sendEscalationAlert(data.adminId, data.issues);
    }

    logger.info(`[Escalation Job] Escalated ${staleIssues.length} issue(s).`);
  } catch (err) {
    logger.error("[Escalation Job] Failed", { error: err.message, stack: err.stack });
  }
};

/**
 * Schedule and start the escalation job.
 * Pattern: every hour at minute 0.
 * Override with CRON_ESCALATION_PATTERN env var for custom schedules.
 */
const startEscalationJob = () => {
  const pattern = process.env.CRON_ESCALATION_PATTERN || "0 * * * *";

  const job = cron.schedule(pattern, runEscalation, {
    scheduled: true,
    timezone: "Asia/Kolkata",
  });

  logger.info(`[Escalation Job] Scheduled (pattern: ${pattern}, tz: Asia/Kolkata)`);
  return job;
};

module.exports = { startEscalationJob, runEscalation };

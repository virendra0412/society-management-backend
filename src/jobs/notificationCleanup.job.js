/**
 * jobs/notificationCleanup.job.js
 *
 * Task 3 — Cron Job 3: Notification Cleanup
 *
 * Runs every Sunday at 2:00 AM IST (weekly, low-traffic window).
 *
 * Deletes Notification documents older than 90 days.
 *
 * Design notes:
 *   - Uses deleteMany with a direct timestamp query — no need to load docs.
 *   - Batches by societyId are NOT used here because the Notification model
 *     stores one doc per user-notification; a single deleteMany is efficient
 *     as long as there is an index on `createdAt` (added below as a reminder).
 *   - 90-day retention mirrors the AuditLog comment in auditLog.model.js so
 *     both systems stay in sync.
 *   - If the Notification model doesn't exist yet in the project, the job
 *     catches the error gracefully and logs a warning rather than crashing.
 */

const cron   = require("node-cron");
const logger = require("../utils/logger");

// Lazy-require so the job can be registered even before the model file exists.
const getNotificationModel = () => {
  try {
    return require("../models/notification.model");
  } catch {
    return null;
  }
};

const RETENTION_DAYS = parseInt(process.env.NOTIFICATION_RETENTION_DAYS || "90", 10);

// ─── Cleanup runner ───────────────────────────────────────────────────────────

const runNotificationCleanup = async () => {
  logger.info("[Notification Cleanup Job] Starting weekly notification cleanup...");

  const Notification = getNotificationModel();
  if (!Notification) {
    logger.warn("[Notification Cleanup Job] Notification model not found — skipping. Create src/models/notification.model.js when ready.");
    return;
  }

  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const result = await Notification.deleteMany({
      createdAt: { $lt: cutoff },
    });

    logger.info(
      `[Notification Cleanup Job] Deleted ${result.deletedCount} notification(s) older than ${RETENTION_DAYS} days (cutoff: ${cutoff.toISOString()}).`
    );
  } catch (err) {
    logger.error("[Notification Cleanup Job] Cleanup failed", { error: err.message });
  }
};

// ─── Scheduler ───────────────────────────────────────────────────────────────

const startNotificationCleanupJob = () => {
  // Every Sunday at 2:00 AM IST — override via CRON_NOTIFICATION_CLEANUP env var
  const pattern = process.env.CRON_NOTIFICATION_CLEANUP || "0 2 * * 0";
  cron.schedule(pattern, runNotificationCleanup, {
    scheduled: true,
    timezone:  "Asia/Kolkata",
  });
  logger.info(`[Notification Cleanup Job] Scheduled (pattern: ${pattern}, tz: Asia/Kolkata)`);
};

module.exports = { startNotificationCleanupJob, runNotificationCleanup };
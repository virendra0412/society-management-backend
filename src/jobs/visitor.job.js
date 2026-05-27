const cron = require("node-cron");
const visitorRepository = require("../repositories/visitor.repository");
const logger = require("../utils/logger");

/**
 * Visitor Cleanup Job — runs every hour.
 *
 * 1. Expires all "invited" visitor records whose OTP has passed entryOTPExpires.
 *    Sets their status to "expired" so security can see them as stale.
 */
const runVisitorCleanup = async () => {
  logger.info("[Visitor Job] Starting cleanup...");

  try {
    const result = await visitorRepository.expireOldInvites();
    if (result.modifiedCount > 0) {
      logger.info(`[Visitor Job] Expired ${result.modifiedCount} stale invite(s).`);
    } else {
      logger.info("[Visitor Job] No stale invites to expire.");
    }
  } catch (err) {
    logger.error("[Visitor Job] Cleanup failed", { error: err.message, stack: err.stack });
  }
};

const startVisitorJob = () => {
  const pattern = process.env.CRON_VISITOR_CLEANUP || "0 * * * *"; // every hour

  const job = cron.schedule(pattern, runVisitorCleanup, {
    scheduled: true,
    timezone: "Asia/Kolkata",
  });

  logger.info(`[Visitor Job] Cleanup scheduled (pattern: ${pattern}, tz: Asia/Kolkata)`);
  return job;
};

module.exports = { startVisitorJob, runVisitorCleanup };

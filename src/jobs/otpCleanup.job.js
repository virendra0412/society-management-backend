/**
 * jobs/otpCleanup.job.js
 *
 * Task 3 — Cron Job 2: OTP Cleanup
 *
 * Runs every hour.
 *
 * Clears expired OTPs from the User collection:
 *   - passwordResetOTP / passwordResetOTPExpires
 *   - passwordResetToken / passwordResetTokenExpires
 *
 * Design notes:
 *   - Null-sets both the hash and the expiry so the schema stays consistent.
 *   - Uses updateMany for efficiency — no need to load documents into memory.
 *   - A failed cleanup is non-critical (expired OTPs are already unacceptable
 *     for auth), so errors are logged but don't crash the process.
 */

const cron   = require("node-cron");
const User   = require("../models/user.model");
const logger = require("../utils/logger");

// ─── Cleanup runner ───────────────────────────────────────────────────────────

const runOtpCleanup = async () => {
  const now = new Date();

  try {
    // Clear expired password-reset OTPs
    const otpResult = await User.updateMany(
      {
        passwordResetOTPExpires: { $lte: now },
        passwordResetOTP:        { $ne: null },
      },
      {
        $set: {
          passwordResetOTP:        null,
          passwordResetOTPExpires: null,
        },
      }
    );

    // Clear expired password-reset tokens
    const tokenResult = await User.updateMany(
      {
        passwordResetTokenExpires: { $lte: now },
        passwordResetToken:        { $ne: null },
      },
      {
        $set: {
          passwordResetToken:        null,
          passwordResetTokenExpires: null,
        },
      }
    );

    const total = otpResult.modifiedCount + tokenResult.modifiedCount;
    if (total > 0) {
      logger.info(
        `[OTP Cleanup Job] Cleared ${otpResult.modifiedCount} expired OTP(s) and ${tokenResult.modifiedCount} expired reset token(s).`
      );
    }
  } catch (err) {
    logger.error("[OTP Cleanup Job] Cleanup failed", { error: err.message });
  }
};

// ─── Scheduler ───────────────────────────────────────────────────────────────

const startOtpCleanupJob = () => {
  // Every hour at minute 0 — override via CRON_OTP_CLEANUP env var
  const pattern = process.env.CRON_OTP_CLEANUP || "0 * * * *";
  cron.schedule(pattern, runOtpCleanup, {
    scheduled: true,
    timezone:  "Asia/Kolkata",
  });
  logger.info(`[OTP Cleanup Job] Scheduled (pattern: ${pattern}, tz: Asia/Kolkata)`);
};

module.exports = { startOtpCleanupJob, runOtpCleanup };
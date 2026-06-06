const cron = require("node-cron");
const visitorRepository = require("../repositories/visitor.repository");
const { sendPushNotification } = require("../utils/notification");
const logger = require("../utils/logger");

// ─── Task 1: Expire stale OTP invites ─────────────────────────────────────────
const expireStaleInvites = async () => {
  try {
    const result = await visitorRepository.expireOldInvites();
    if (result.modifiedCount > 0) {
      logger.info(`[Visitor Job] Expired ${result.modifiedCount} stale OTP invite(s).`);
    }
  } catch (err) {
    logger.error("[Visitor Job] OTP expiry failed", { error: err.message });
  }
};

// ─── Task 2: Expire trusted passes past their validUntil ──────────────────────
const expireOldTrustedPasses = async () => {
  try {
    const result = await visitorRepository.expireOldTrustedPasses();
    if (result.modifiedCount > 0) {
      logger.info(`[Visitor Job] Expired ${result.modifiedCount} trusted pass(es).`);
    }
  } catch (err) {
    logger.error("[Visitor Job] Trusted pass expiry failed", { error: err.message });
  }
};

// ─── Task 3: Notify residents about passes expiring in 3 days ─────────────────
const notifyExpiringTrustedPasses = async () => {
  try {
    const passes = await visitorRepository.findExpiringTrustedPasses(3);
    if (passes.length === 0) return;

    const byHost = {};
    for (const pass of passes) {
      const host = pass.host;
      if (!host?.fcmToken) continue;
      if (!byHost[host._id]) byHost[host._id] = { host, passes: [] };
      byHost[host._id].passes.push(pass);
    }

    for (const { host, passes: expiring } of Object.values(byHost)) {
      const names = expiring.map(p => p.name).join(", ");
      await sendPushNotification(
        [host.fcmToken],
        {
          title: "⏰ Trusted Pass Expiring Soon",
          body:  `Pass for ${names} will expire within 3 days. Renew from the Visitors section.`,
        },
        { type: "trusted_pass_expiry" }
      );
    }

    logger.info(`[Visitor Job] Sent expiry alerts for ${passes.length} trusted pass(es).`);
  } catch (err) {
    logger.error("[Visitor Job] Expiry notification failed", { error: err.message });
  }
};

// ─── Task 4: Auto-exit deliveries past their auto-exit time ───────────────────
const autoExitDeliveries = async () => {
  try {
    const result = await visitorRepository.autoExitDeliveries();
    if (result.modifiedCount > 0) {
      logger.info(`[Visitor Job] Auto-exited ${result.modifiedCount} delivery visitor(s).`);
    }
  } catch (err) {
    logger.error("[Visitor Job] Delivery auto-exit failed", { error: err.message });
  }
};

// ─── Task 5: Daily digest for trusted visitor entries ─────────────────────────
/**
 * Sends a daily summary to residents about their trusted visitors who entered today.
 * Runs at 9 PM IST so residents get an end-of-day summary.
 * Only sends if there were actual entries today.
 */
const sendTrustedVisitorDigest = async () => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const Visitor = require("../models/visitor.model");
    const User    = require("../models/user.model");

    // Find all trusted visitors who entered today, group by host
    const entries = await Visitor.find({
      isTrusted: true,
      entryTime: { $gte: todayStart, $lte: todayEnd },
    })
      .select("name entryTime host hostFlat")
      .lean();

    if (entries.length === 0) return;

    const byHost = {};
    for (const entry of entries) {
      const hostId = entry.host?.toString();
      if (!hostId) continue;
      if (!byHost[hostId]) byHost[hostId] = [];
      byHost[hostId].push(entry);
    }

    const hostIds = Object.keys(byHost);
    const hosts = await User.find({ _id: { $in: hostIds } })
      .select("+fcmToken name flat")
      .lean();

    for (const host of hosts) {
      if (!host.fcmToken) continue;
      const myEntries = byHost[host._id.toString()];
      if (!myEntries?.length) continue;

      const summary = myEntries
        .map(e => {
          const t = new Date(e.entryTime);
          return `${e.name} at ${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`;
        })
        .join(", ");

      await sendPushNotification(
        [host.fcmToken],
        {
          title: "🏠 Trusted Visitor Daily Summary",
          body:  `Today's entries: ${summary}`,
        },
        { type: "trusted_visitor_digest" }
      );
    }

    logger.info(`[Visitor Job] Sent daily digest to ${hosts.length} resident(s) for ${entries.length} trusted entries.`);
  } catch (err) {
    logger.error("[Visitor Job] Daily digest failed", { error: err.message });
  }
};

// ─── Job Scheduler ─────────────────────────────────────────────────────────────
const runVisitorCleanup = async () => {
  logger.info("[Visitor Job] Starting cleanup run...");
  await expireStaleInvites();
  await expireOldTrustedPasses();
  await notifyExpiringTrustedPasses();
  await autoExitDeliveries();
};

const startVisitorJob = () => {
  // Main cleanup: every hour
  const cleanupPattern = process.env.CRON_VISITOR_CLEANUP || "0 * * * *";
  cron.schedule(cleanupPattern, runVisitorCleanup, {
    scheduled: true,
    timezone: "Asia/Kolkata",
  });
  logger.info(`[Visitor Job] Cleanup scheduled (pattern: ${cleanupPattern}, tz: Asia/Kolkata)`);

  // Delivery auto-exit: every 5 minutes for low latency
  cron.schedule("*/5 * * * *", autoExitDeliveries, {
    scheduled: true,
    timezone: "Asia/Kolkata",
  });
  logger.info("[Visitor Job] Delivery auto-exit scheduled every 5 minutes");

  // Daily digest: 9 PM IST
  const digestPattern = process.env.CRON_TRUSTED_DIGEST || "0 21 * * *";
  cron.schedule(digestPattern, sendTrustedVisitorDigest, {
    scheduled: true,
    timezone: "Asia/Kolkata",
  });
  logger.info(`[Visitor Job] Trusted visitor digest scheduled (pattern: ${digestPattern})`);
};

module.exports = { startVisitorJob, runVisitorCleanup, sendTrustedVisitorDigest };
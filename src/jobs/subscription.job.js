/**
 * jobs/subscription.job.js
 *
 * Task 3 — Cron Job 1: Subscription Expiry Checker
 *
 * Runs daily at 9:00 AM IST.
 *
 * Responsibilities:
 *   1. Find all active subscriptions expiring within 7 days — send push + (log) email to society admin.
 *   2. Find all subscriptions whose endDate has passed — mark them as "expired".
 *
 * Design notes:
 *   - Uses lean() queries for performance; only loads fields we need.
 *   - Reminds once per day at most (compares lastExpiryReminderAt).
 *   - Populates society → admin → fcmToken so we can push without a second query.
 *   - "Email" here logs to console in dev; plug in nodemailer/SendGrid in prod.
 */

const cron = require("node-cron");
const mongoose = require("mongoose");
const { Subscription } = require("../models/subscription.model");
const { sendPushNotification } = require("../utils/notification");
const logger = require("../utils/logger");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Simulated email sender.
 * Replace with nodemailer / SendGrid / AWS SES in production.
 */
const sendExpiryEmail = async ({ adminEmail, adminName, societyName, daysLeft, plan }) => {
  // In production: await transporter.sendMail({ to: adminEmail, subject: ..., html: ... });
  logger.info(`[Subscription Job] EMAIL → ${adminEmail} | Society: "${societyName}" | Plan: ${plan} | ${daysLeft} day(s) left`);
};

// ─── Task A: Warn societies expiring within 7 days ────────────────────────────

const warnExpiringSubscriptions = async () => {
  const now      = new Date();
  const in7days  = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Find active subs expiring within 7 days that we haven't reminded in the last 24h
  const subs = await Subscription.find({
    status:  "active",
    endDate: { $gte: now, $lte: in7days },
    $or: [
      { lastExpiryReminderAt: { $exists: false } },
      { lastExpiryReminderAt: null },
      { lastExpiryReminderAt: { $lte: oneDayAgo } },
    ],
  })
    .populate({
      path:   "society",
      select: "name admin",
      populate: {
        path:   "admin",
        select: "name email +fcmToken",
      },
    })
    .lean();

  if (subs.length === 0) {
    logger.info("[Subscription Job] No expiring subscriptions to warn.");
    return;
  }

  let pushed = 0;
  let emailed = 0;

  for (const sub of subs) {
    const society = sub.society;
    const admin   = society?.admin;
    if (!admin) continue;

    const daysLeft = Math.ceil((new Date(sub.endDate) - now) / 86_400_000);
    const societyName = society.name || "Your Society";
    const plan = sub.plan;

    // Push notification
    if (admin.fcmToken) {
      await sendPushNotification(
        [admin.fcmToken],
        {
          title: "⚠️ Subscription Expiring Soon",
          body:  `${societyName}'s ${plan} plan expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}. Renew to avoid service interruption.`,
        },
        { type: "subscription_expiry_warning", societyId: society._id?.toString(), daysLeft }
      );
      pushed++;
    }

    // Email notification
    if (admin.email) {
      await sendExpiryEmail({
        adminEmail: admin.email,
        adminName:  admin.name,
        societyName,
        daysLeft,
        plan,
      });
      emailed++;
    }

    // Mark as reminded (update via model to avoid the immutability guard on AuditLog)
    await Subscription.updateOne(
      { _id: sub._id },
      { $set: { lastExpiryReminderAt: now } }
    );
  }

  logger.info(`[Subscription Job] Expiry warnings sent — pushed: ${pushed}, emailed: ${emailed}, total: ${subs.length}`);
};

// ─── Task B: Auto-downgrade expired trials to free; mark paid plans as expired ─

const markExpiredSubscriptions = async () => {
  const now = new Date();
  const Society = require("../models/society.model");

  // Handle expired trial subscriptions → auto-downgrade to "free"
  const trialResult = await Subscription.updateMany(
    { status: "active", plan: "trial", endDate: { $lt: now } },
    {
      $set: { plan: "free", endDate: null },  // Remove expiry date for free plan
      $push: {
        history: {
          action:     "auto-downgraded",
          fromPlan:   "trial",
          toPlan:     "free",
          fromStatus: "active",
          toStatus:   "active",
          note:       "Trial expired — automatically downgraded to free plan by daily subscription checker.",
          performedAt: now,
        },
      },
    }
  );

  // TC-FP-004: Reset enabledModules for societies with expired trial subscriptions
  if (trialResult.modifiedCount > 0) {
    const expiredTrialSubs = await Subscription.find(
      { status: "active", plan: "free", updatedAt: { $gte: new Date(now - 5000) } },  // Recently downgraded
      "society"
    ).lean();

    const societyIds = expiredTrialSubs.map(sub => sub.society);
    if (societyIds.length > 0) {
      const freeModules = {
        notices: true,
        polls: true,
        contacts: true,
        issues: false,
        visitors: false,
        maintenance: false,
        amenities: false,
        events: false,
        parking: false,
        community: false,
        analytics: false,
        multilang: false,
      };
      await Society.updateMany(
        { _id: { $in: societyIds } },
        { $set: { enabledModules: freeModules } }
      );
    }
  }

  if (trialResult.modifiedCount > 0) {
    logger.info(`[Subscription Job] Auto-downgraded ${trialResult.modifiedCount} trial(s) to free plan.`);
  }

  // Handle expired paid plan subscriptions → mark as "expired" and gate paid modules
  const paidResult = await Subscription.updateMany(
    { status: "active", plan: { $in: ["basic", "premium"] }, endDate: { $lt: now } },
    {
      $set: { status: "expired" },
      $push: {
        history: {
          action:     "expired",
          fromStatus: "active",
          toStatus:   "expired",
          note:       "Expired by daily subscription checker. SA action required for renewal/upgrade.",
          performedAt: now,
        },
      },
    }
  );

  // TC-FP-004: Reset enabledModules for societies with expired paid subscriptions
  if (paidResult.modifiedCount > 0) {
    const expiredPaidSubs = await Subscription.find(
      { status: "expired", updatedAt: { $gte: new Date(now - 5000) } },  // Recently expired
      "society"
    ).lean();

    const societyIds = expiredPaidSubs.map(sub => sub.society);
    if (societyIds.length > 0) {
      const freeModules = {
        notices: true,
        polls: true,
        contacts: true,
        issues: false,
        visitors: false,
        maintenance: false,
        amenities: false,
        events: false,
        parking: false,
        community: false,
        analytics: false,
        multilang: false,
      };
      await Society.updateMany(
        { _id: { $in: societyIds } },
        { $set: { enabledModules: freeModules } }
      );
    }
  }

  if (paidResult.modifiedCount > 0) {
    logger.info(`[Subscription Job] Marked ${paidResult.modifiedCount} paid plan(s) as expired.`);
  }
};

// ─── Main runner ──────────────────────────────────────────────────────────────

const runSubscriptionCheck = async () => {
  logger.info("[Subscription Job] Starting daily subscription check...");
  try {
    await warnExpiringSubscriptions();
    await markExpiredSubscriptions();
    logger.info("[Subscription Job] Daily subscription check complete.");
  } catch (err) {
    logger.error("[Subscription Job] Uncaught error during run", { error: err.message, stack: err.stack });
  }
};

// ─── Scheduler ───────────────────────────────────────────────────────────────

const startSubscriptionJob = () => {
  // Daily at 9:00 AM IST — override via CRON_SUBSCRIPTION_CHECK env var
  const pattern = process.env.CRON_SUBSCRIPTION_CHECK || "0 9 * * *";
  cron.schedule(pattern, runSubscriptionCheck, {
    scheduled: true,
    timezone:  "Asia/Kolkata",
  });
  logger.info(`[Subscription Job] Scheduled (pattern: ${pattern}, tz: Asia/Kolkata)`);
};

module.exports = { startSubscriptionJob, runSubscriptionCheck };
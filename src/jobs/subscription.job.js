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
const { sendSubscriptionExpiryEmail } = require("../utils/email");
const logger = require("../utils/logger");

// ─── Helpers ──────────────────────────────────────────────────────────────────
// (Real email sending now lives in utils/email.js — sendSubscriptionExpiryEmail
// — using the same branded template as the approval/rejection/OTP emails.)

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

    // Email notification — best-effort; a failed send shouldn't stop the
    // cron from processing the rest of the expiring societies.
    if (admin.email) {
      try {
        await sendSubscriptionExpiryEmail({
          to: admin.email,
          adminName:  admin.name,
          societyName,
          daysLeft,
          plan,
        });
        emailed++;
      } catch (err) {
        logger.error("[Subscription Job] Failed to send expiry email", {
          societyId: society._id?.toString(),
          adminEmail: admin.email,
          error: err.message,
        });
      }
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
  const trialFilter = { status: "active", plan: "trial", endDate: { $lt: now } };
  // Capture affected society IDs first to reliably reset modules even under DB load
  const trialSubsToDowngrade = await Subscription.find(trialFilter, "society").lean();
  const trialSocietyIds = Array.from(new Set(trialSubsToDowngrade.map(s => s.society).filter(Boolean)));

  let trialResult = { modifiedCount: 0 };
  if (trialSocietyIds.length > 0) {
    trialResult = await Subscription.updateMany(
      trialFilter,
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

    if (trialResult.modifiedCount > 0) {
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
      await Society.updateMany({ _id: { $in: trialSocietyIds } }, { $set: { enabledModules: freeModules } });
    }
  }

  if (trialResult.modifiedCount > 0) {
    logger.info(`[Subscription Job] Auto-downgraded ${trialResult.modifiedCount} trial(s) to free plan.`);
  }

  // Handle expired paid plan subscriptions → mark as "expired" and gate paid modules
  const paidFilter = { status: "active", plan: { $in: ["starter", "professional", "enterprise"] }, endDate: { $lt: now } };
  const paidSubsToExpire = await Subscription.find(paidFilter, "society").lean();
  const paidSocietyIds = Array.from(new Set(paidSubsToExpire.map(s => s.society).filter(Boolean)));

  let paidResult = { modifiedCount: 0 };
  if (paidSocietyIds.length > 0) {
    paidResult = await Subscription.updateMany(
      paidFilter,
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

    if (paidResult.modifiedCount > 0) {
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
      await Society.updateMany({ _id: { $in: paidSocietyIds } }, { $set: { enabledModules: freeModules } });
    }
  }

  if (paidResult.modifiedCount > 0) {
    logger.info(`[Subscription Job] Marked ${paidResult.modifiedCount} paid plan(s) as expired.`);
  }
};

// ─── Task C: Apply scheduled downgrades at renewal date ──────────────────────
// When a SA schedules a downgrade (pendingPlan set), apply it once the
// society's endDate has passed. This runs AFTER markExpiredSubscriptions
// so the plan switch takes effect cleanly at the boundary.

const applyPendingDowngrades = async () => {
  const now     = new Date();
  const Society = require("../models/society.model");

  // Find subscriptions where pendingPlan is set and pendingPlanAt has arrived
  const pending = await Subscription.find({
    status:        "active",
    pendingPlan:   { $ne: null },
    pendingPlanAt: { $lte: now },
  }).lean();

  if (pending.length === 0) return;

  const FREE_MODULE_STATE = {
    notices: true, polls: true, contacts: true,
    issues: false, visitors: false, maintenance: false,
    amenities: false, events: false, parking: false,
    community: false, analytics: false, multilang: false,
  };

  for (const sub of pending) {
    try {
      const toPlan = sub.pendingPlan;

      await Subscription.updateOne(
        { _id: sub._id },
        {
          $set: {
            plan:          toPlan,
            pendingPlan:   null,
            pendingPlanAt: null,
            // free plan has no expiry; others keep current endDate as new start
            ...(toPlan === "free" ? { endDate: null } : {}),
          },
          $push: {
            history: {
              action:      "downgrade_applied",
              fromPlan:    sub.plan,
              toPlan,
              fromStatus:  "active",
              toStatus:    "active",
              note:        `Scheduled downgrade from ${sub.plan} to ${toPlan} applied at renewal by daily job.`,
              performedAt: now,
            },
          },
        }
      );

      // Restrict modules to free tier for starter/free downgrades
      if (toPlan === "free" || toPlan === "starter") {
        await Society.updateOne(
          { _id: sub.society },
          { $set: { enabledModules: FREE_MODULE_STATE } }
        );
      }

      logger.info(`[Subscription Job] Downgrade applied: ${sub.plan} → ${toPlan}`, {
        societyId: sub.society,
      });
    } catch (err) {
      logger.error("[Subscription Job] Failed to apply pending downgrade", {
        subscriptionId: sub._id,
        error: err.message,
      });
    }
  }

  logger.info(`[Subscription Job] Applied ${pending.length} pending downgrade(s).`);
};

const runSubscriptionCheck = async () => {
  logger.info("[Subscription Job] Starting daily subscription check...");
  try {
    await warnExpiringSubscriptions();
    await markExpiredSubscriptions();
    await applyPendingDowngrades();
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
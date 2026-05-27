const cron = require("node-cron");
const eventRepository = require("../repositories/event.repository");
const { sendPushNotification } = require("../utils/notification");
const User = require("../models/user.model");
const logger = require("../utils/logger");

/**
 * Event Reminder Job — runs every hour.
 *
 * Finds all published, non-cancelled events starting in the next 24–25 hours
 * that haven't had a reminder sent yet.
 *
 * Sends push notifications to:
 *   - All residents who RSVPed "going" or "maybe"
 *   - If no RSVPs exist, notifies ALL society members (new event visibility)
 */
const runEventReminderJob = async () => {
  logger.info("[Event Job] Starting reminder run...");

  try {
    const events = await eventRepository.findEventsNeedingReminder();

    if (events.length === 0) {
      logger.info("[Event Job] No upcoming events needing reminders.");
      return;
    }

    const notifiedEventIds = [];

    for (const event of events) {
      const interestedIds = event.rsvps
        .filter(r => r.status === "going" || r.status === "maybe")
        .map(r => r.resident);

      let tokens = [];

      if (interestedIds.length > 0) {
        // Notify only those who RSVPed
        const users = await User.find({
          _id:      { $in: interestedIds },
          fcmToken: { $ne: null },
          isActive: true,
        }).select("fcmToken").lean();
        tokens = users.map(u => u.fcmToken).filter(Boolean);
      } else {
        // No RSVPs yet — notify all society members
        const users = await User.find({
          society:    event.society._id,
          isApproved: true,
          isActive:   true,
          fcmToken:   { $ne: null },
        }).select("fcmToken").lean();
        tokens = users.map(u => u.fcmToken).filter(Boolean);
      }

      if (tokens.length > 0) {
        const timeStr = event.startTime.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Kolkata",
        });

        await sendPushNotification(
          tokens,
          {
            title: `⏰ Reminder: ${event.title}`,
            body:  `Tomorrow at ${timeStr}${event.venue ? ` · ${event.venue}` : ""}`,
          },
          { type: "event_reminder", eventId: event._id.toString() }
        );

        logger.info(
          `[Event Job] Reminder sent for "${event.title}" to ${tokens.length} resident(s).`
        );
      }

      notifiedEventIds.push(event._id);
    }

    if (notifiedEventIds.length > 0) {
      await eventRepository.markReminderSent(notifiedEventIds);
    }

    logger.info(`[Event Job] Done. ${notifiedEventIds.length} event(s) processed.`);
  } catch (err) {
    logger.error("[Event Job] Reminder run failed", { error: err.message, stack: err.stack });
  }
};

const startEventJob = () => {
  const pattern = process.env.CRON_EVENT_REMINDER || "0 * * * *"; // every hour

  const job = cron.schedule(pattern, runEventReminderJob, {
    scheduled: true,
    timezone: "Asia/Kolkata",
  });

  logger.info(`[Event Job] Reminder job scheduled (pattern: ${pattern}, tz: Asia/Kolkata)`);
  return job;
};

module.exports = { startEventJob, runEventReminderJob };

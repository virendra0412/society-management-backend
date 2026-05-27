const cron = require("node-cron");
const maintenanceRepository = require("../repositories/maintenance.repository");
const userRepository = require("../repositories/user.repository");
const { sendPushNotification } = require("../utils/notification");
const logger = require("../utils/logger");

/**
 * Maintenance Reminder Job
 *
 * Runs daily at 9:00 AM IST.
 *
 * For each published, non-closed bill past its due date:
 *   1. Finds all unpaid/overdue payment records.
 *   2. Skips records reminded in the last 24 hours (avoid spam).
 *   3. Sends a push notification to the resident.
 *   4. Increments remindersSent and updates lastReminderAt.
 *
 * Also runs a "pre-due" reminder 3 days before the due date
 * so residents can pay on time.
 */

const REMINDER_COOLDOWN_HOURS = 24; // Don't remind more than once per day

const runMaintenanceReminderJob = async () => {
  logger.info("[Maintenance Job] Starting reminder run...");

  try {
    const bills = await maintenanceRepository.findBillsNeedingReminders();

    if (bills.length === 0) {
      logger.info("[Maintenance Job] No overdue bills found.");
      return;
    }

    let totalReminders = 0;

    for (const bill of bills) {
      const overdueRecords = bill.payments.filter(
        (p) => p.status === "unpaid" || p.status === "overdue"
      );

      for (const record of overdueRecords) {
        // Skip if reminded too recently
        if (record.lastReminderAt) {
          const hoursSinceLastReminder =
            (Date.now() - record.lastReminderAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceLastReminder < REMINDER_COOLDOWN_HOURS) continue;
        }

        // Fetch the resident's FCM token
        const resident = await userRepository.findById(record.resident);
        if (!resident) continue;

        const daysOverdue = Math.floor(
          (Date.now() - bill.dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        const notificationBody =
          daysOverdue === 0
            ? `Your maintenance payment of ₹${record.totalDue} for "${bill.title}" is due today.`
            : `Your maintenance payment of ₹${record.totalDue} for "${bill.title}" is ${daysOverdue} day(s) overdue.`;

        if (resident.fcmToken) {
          await sendPushNotification(
            [resident.fcmToken],
            {
              title: "⚠️ Maintenance Payment Due",
              body: notificationBody,
            },
            {
              type: "maintenance_reminder",
              billId: bill._id.toString(),
              paymentId: record._id.toString(),
              daysOverdue: String(daysOverdue),
            }
          );
        }

        // Update reminder tracking
        await maintenanceRepository.markReminderSent(bill._id, record._id);
        totalReminders++;

        logger.info(
          `[Maintenance Job] Reminder sent to ${resident.name} (flat ${record.flat}) for "${bill.title}"`,
          { billId: bill._id, residentId: resident._id, daysOverdue }
        );
      }
    }

    logger.info(`[Maintenance Job] Done. ${totalReminders} reminder(s) sent.`);
  } catch (err) {
    logger.error("[Maintenance Job] Failed", { error: err.message, stack: err.stack });
  }
};

/**
 * Pre-due reminder job — runs daily at 8:00 AM IST.
 * Notifies residents 3 days before the due date.
 */
const runPreDueReminderJob = async () => {
  logger.info("[Maintenance Job] Starting pre-due reminder run...");

  try {
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Find bills due in the next 3 days (exclusive — not yet overdue)
    const { MaintenanceBill } = require("../models/maintenance.model");
    const upcomingBills = await MaintenanceBill.find({
      isPublished: true,
      isClosed: false,
      dueDate: { $gte: tomorrow, $lte: threeDaysFromNow },
      "payments.status": "unpaid",
    })
      .select("title dueDate payments")
      .lean();

    let count = 0;

    for (const bill of upcomingBills) {
      const unpaid = bill.payments.filter((p) => p.status === "unpaid");
      for (const record of unpaid) {
        const resident = await userRepository.findById(record.resident);
        if (!resident?.fcmToken) continue;

        const daysLeft = Math.ceil((bill.dueDate - Date.now()) / (1000 * 60 * 60 * 24));

        await sendPushNotification(
          [resident.fcmToken],
          {
            title: "📅 Maintenance Due Soon",
            body: `Your payment of ₹${record.totalDue} for "${bill.title}" is due in ${daysLeft} day(s).`,
          },
          { type: "maintenance_pre_due", billId: bill._id.toString() }
        );
        count++;
      }
    }

    logger.info(`[Maintenance Job] Pre-due: ${count} reminder(s) sent.`);
  } catch (err) {
    logger.error("[Maintenance Job] Pre-due run failed", { error: err.message });
  }
};

const startMaintenanceJobs = () => {
  // Overdue reminders — daily at 9:00 AM IST
  const overdueJob = cron.schedule(
    process.env.CRON_MAINTENANCE_REMINDER || "0 9 * * *",
    runMaintenanceReminderJob,
    { scheduled: true, timezone: "Asia/Kolkata" }
  );

  // Pre-due reminders — daily at 8:00 AM IST
  const preDueJob = cron.schedule(
    process.env.CRON_MAINTENANCE_PREDUE || "0 8 * * *",
    runPreDueReminderJob,
    { scheduled: true, timezone: "Asia/Kolkata" }
  );

  logger.info("[Maintenance Job] Overdue reminders scheduled — daily 9:00 AM IST");
  logger.info("[Maintenance Job] Pre-due reminders scheduled — daily 8:00 AM IST");

  return { overdueJob, preDueJob };
};

module.exports = { startMaintenanceJobs, runMaintenanceReminderJob, runPreDueReminderJob };

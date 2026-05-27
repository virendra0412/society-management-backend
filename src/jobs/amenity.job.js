const cron = require("node-cron");
const amenityRepository = require("../repositories/amenity.repository");
const logger = require("../utils/logger");

/**
 * Amenity Booking Completion Job — runs every 30 minutes.
 *
 * Finds all "confirmed" bookings whose endTime has passed and marks them
 * as "completed". This keeps the status accurate so residents and admins
 * don't see old confirmed slots blocking the availability calendar.
 */
const runAmenityCompletionJob = async () => {
  try {
    const completable = await amenityRepository.findCompletableBookings();
    if (completable.length === 0) return;

    const ids = completable.map(b => b._id);
    const result = await amenityRepository.bulkMarkCompleted(ids);

    logger.info(`[Amenity Job] Marked ${result.modifiedCount} booking(s) as completed.`);
  } catch (err) {
    logger.error("[Amenity Job] Completion job failed", { error: err.message, stack: err.stack });
  }
};

const startAmenityJob = () => {
  const pattern = process.env.CRON_AMENITY_COMPLETION || "*/30 * * * *"; // every 30 min

  const job = cron.schedule(pattern, runAmenityCompletionJob, {
    scheduled: true,
    timezone: "Asia/Kolkata",
  });

  logger.info(`[Amenity Job] Completion job scheduled (pattern: ${pattern}, tz: Asia/Kolkata)`);
  return job;
};

module.exports = { startAmenityJob, runAmenityCompletionJob };

require("dotenv").config();

const app      = require("./src/app");
const connectDB = require("./src/config/db");
const logger   = require("./src/utils/logger");
const { port, env } = require("./src/config/env");

// ─── Background Jobs ──────────────────────────────────────────────────────────
const { startEscalationJob }    = require("./src/jobs/escalation.job");
const { startMaintenanceJobs }  = require("./src/jobs/maintenance.job");
const { startVisitorJob }       = require("./src/jobs/visitor.job");
const { startAmenityJob }       = require("./src/jobs/amenity.job");
const { startEventJob }         = require("./src/jobs/event.job");

// ─── Catch Unhandled Errors Before DB Connect ─────────────────────────────────
process.on("unhandledRejection", (reason) => {
  logger.error("UNHANDLED REJECTION — shutting down", {
    reason: reason?.message || reason,
    stack:  reason?.stack,
  });
  server?.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 5000).unref();
});

process.on("uncaughtException", (err) => {
  logger.error("UNCAUGHT EXCEPTION — shutting down immediately", {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

// ─── Start Server ─────────────────────────────────────────────────────────────
let server;

const start = async () => {
  await connectDB();

  server = app.listen(port, () => {
    logger.info("Server started", {
      environment: env,
      port,
      url: `http://localhost:${port}`,
      api: `http://localhost:${port}/api/v1`,
    });
  });

  if (env !== "test") {
    // Phase 1
    startEscalationJob();       // issue auto-escalation

    // Phase 2 — Visitor & Maintenance
    startMaintenanceJobs();     // due-date & pre-due reminders
    startVisitorJob();          // expire stale visitor OTPs

    // Phase 2 — Amenity, Events, Parking
    startAmenityJob();          // mark past bookings as completed
    startEventJob();            // 24h event reminders
  }
};

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received — initiating graceful shutdown`);
  server?.close((err) => {
    if (err) {
      logger.error("Error during server close", { error: err.message });
      process.exit(1);
    }
    logger.info("HTTP server closed. Goodbye.");
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn("Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, 15000).unref();
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

start().catch((err) => {
  logger.error("Failed to start server", { error: err.message, stack: err.stack });
  process.exit(1);
});

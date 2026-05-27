const mongoose = require("mongoose");
const logger = require("../utils/logger");
const { mongoUri, env } = require("./env");

const MONGO_OPTIONS = {
  // Pool size for concurrent operations
  maxPoolSize: 10,
  minPoolSize: 2,
  // Timeout settings
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  // Heartbeat to detect disconnections
  heartbeatFrequencyMS: 10000,
};

// Disable verbose logging in production
if (env !== "production") {
  mongoose.set("debug", false);
}

mongoose.connection.on("connected", () => {
  logger.info("MongoDB connection established");
});

mongoose.connection.on("error", (err) => {
  logger.error("MongoDB connection error", { error: err.message });
});

mongoose.connection.on("disconnected", () => {
  logger.warn("MongoDB disconnected — will attempt to reconnect");
});

mongoose.connection.on("reconnected", () => {
  logger.info("MongoDB reconnected");
});

// Graceful shutdown — close connection before process exit
const gracefulDisconnect = async () => {
  await mongoose.connection.close();
  logger.info("MongoDB connection closed on app termination");
};

process.on("SIGINT", gracefulDisconnect);
process.on("SIGTERM", gracefulDisconnect);

/**
 * Connect to MongoDB with exponential backoff retry.
 * @param {number} retries - Number of retry attempts remaining
 */
const connectDB = async (retries = 5) => {
  try {
    await mongoose.connect(mongoUri, MONGO_OPTIONS);
  } catch (err) {
    if (retries === 0) {
      logger.error("MongoDB connection failed after all retries. Exiting.", {
        error: err.message,
      });
      process.exit(1);
    }

    const delay = 2 ** (5 - retries) * 1000; // 1s, 2s, 4s, 8s, 16s
    logger.warn(
      `MongoDB connection attempt failed. Retrying in ${delay / 1000}s... (${retries} attempts left)`,
      { error: err.message }
    );

    await new Promise((resolve) => setTimeout(resolve, delay));
    return connectDB(retries - 1);
  }
};

module.exports = connectDB;

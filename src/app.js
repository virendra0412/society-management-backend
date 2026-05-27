require("dotenv").config();
require("express-async-errors"); // Patches async route handlers — no try/catch needed

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const compression = require("compression");
const mongoSanitize = require("express-mongo-sanitize");

const routes = require("./routes");
const { errorMiddleware, notFoundMiddleware } = require("./middlewares/error.middleware");
const { generalLimiter } = require("./middlewares/rateLimiter.middleware");
const { allowedOrigins, env } = require("./config/env");
const logger = require("./utils/logger");

const app = express();

// ─── Security Headers (Helmet) ────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: env === "production",   // Only enforce CSP in prod
    crossOriginEmbedderPolicy: env === "production",
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      logger.warn("CORS: blocked request from origin", { origin });
      callback(new Error(`CORS: origin ${origin} is not allowed`));
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400, // Preflight cache: 24h
  })
);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));        // Reject oversized JSON bodies
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ─── MongoDB Query Injection Prevention ───────────────────────────────────────
// Strips $ and . from user-supplied keys to prevent operator injection attacks
app.use(mongoSanitize({ replaceWith: "_" }));

// ─── Compression ──────────────────────────────────────────────────────────────
app.use(compression());

// ─── HTTP Request Logging ─────────────────────────────────────────────────────
if (env !== "test") {
  app.use(
    morgan(env === "production" ? "combined" : "dev", {
      stream: { write: (msg) => logger.http(msg.trim()) },
      skip: (req) => req.url === "/health", // Skip health check noise
    })
  );
}

// ─── General Rate Limiting ────────────────────────────────────────────────────
app.use("/api", generalLimiter);

// ─── Trust Proxy (for rate limiting behind Nginx/load balancer) ───────────────
if (env === "production") {
  app.set("trust proxy", 1);
}

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    environment: env,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/v1", routes);

// ─── 404 & Error Handlers ─────────────────────────────────────────────────────
app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;

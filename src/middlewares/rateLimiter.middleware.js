const rateLimit = require("express-rate-limit");
const { sendError } = require("../utils/response");
const { rateLimit: rlConfig } = require("../config/env");

const rateLimitHandler = (req, res) =>
  sendError(res, {
    statusCode: 429,
    status: "fail",
    code: "TOO_MANY_REQUESTS",
    message: "Too many requests. Please slow down and try again later.",
  });

/**
 * General API rate limiter — applied to all routes.
 * 100 requests per 15 minutes per IP.
 */
const generalLimiter = rateLimit({
  windowMs:10 * 1000,
  max: 500,
  standardHeaders: true,   // Return RateLimit-* headers
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: (req) => process.env.NODE_ENV === "test",
});

/**
 * Strict limiter for auth endpoints.
 * 10 attempts per 15 minutes per IP — brute-force mitigation.
 */
const authLimiter = rateLimit({
  windowMs:10 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: (req) => process.env.NODE_ENV === "test",
});

/**
 * Vote/action limiter — 1 vote per poll per 10 seconds
 * (backend enforces once-per-poll via DB, this is additional safety)
 */
const actionLimiter = rateLimit({
  windowMs: 10 * 1000, // 10s
  max: 500,
  handler: rateLimitHandler,
  skip: (req) => process.env.NODE_ENV === "test",
});

module.exports = { generalLimiter, authLimiter, actionLimiter };

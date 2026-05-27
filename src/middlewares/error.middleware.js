const mongoose = require("mongoose");
const { sendError } = require("../utils/response");
const logger = require("../utils/logger");
const AppError = require("../utils/AppError");

// ─── MongoDB Error Translators ────────────────────────────────────────────────

const handleCastError = (err) =>
  AppError.badRequest(`Invalid value for field '${err.path}': ${err.value}`);

const handleDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue || {})[0] || "field";
  const value = err.keyValue?.[field];
  return AppError.conflict(
    `An account with ${field} '${value}' already exists.`,
    "DUPLICATE_KEY"
  );
};

const handleValidationError = (err) => {
  const messages = Object.values(err.errors)
    .map((e) => e.message)
    .join(". ");
  return AppError.badRequest(`Validation failed: ${messages}`);
};

const handleJWTError = () => AppError.unauthorized("Invalid token. Please log in again.");
const handleJWTExpired = () => AppError.unauthorized("Token expired. Please log in again.");

// ─── Response Formatters ──────────────────────────────────────────────────────

const sendDevError = (err, res) => {
  logger.error("Error", {
    message: err.message,
    stack: err.stack,
    statusCode: err.statusCode,
  });

  return res.status(err.statusCode || 500).json({
    success: false,
    status: err.status || "error",
    code: err.code || "INTERNAL_ERROR",
    message: err.message,
    stack: err.stack, // Only in development
  });
};

const sendProdError = (err, res) => {
  if (err.isOperational) {
    // Trusted, safe-to-share error
    return sendError(res, {
      statusCode: err.statusCode,
      status: err.status,
      code: err.code,
      message: err.message,
    });
  }

  // Programmer error: log it, send generic message
  logger.error("UNHANDLED PROGRAMMER ERROR", {
    message: err.message,
    stack: err.stack,
  });

  return sendError(res, {
    statusCode: 500,
    status: "error",
    code: "INTERNAL_ERROR",
    message: "Something went wrong. Please try again later.",
  });
};

// ─── Main Error Handler ───────────────────────────────────────────────────────

const errorMiddleware = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  let error = err;

  // Translate known error types into AppErrors
  if (error instanceof mongoose.Error.CastError) error = handleCastError(error);
  else if (error.code === 11000) error = handleDuplicateKeyError(error);
  else if (error instanceof mongoose.Error.ValidationError) error = handleValidationError(error);
  else if (error.name === "JsonWebTokenError") error = handleJWTError();
  else if (error.name === "TokenExpiredError") error = handleJWTExpired();

  if (process.env.NODE_ENV === "development") {
    return sendDevError(error, res);
  }

  return sendProdError(error, res);
};

// ─── 404 Catch-all ────────────────────────────────────────────────────────────
const notFoundMiddleware = (req, res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

module.exports = { errorMiddleware, notFoundMiddleware };

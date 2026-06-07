/**
 * Operational error — safe to send details to client.
 * Programmer errors (null refs, type errors, etc.) are NOT AppErrors
 * and should never reach the client.
 */
class AppError extends Error {
  /**
   * @param {string} message   - Human-readable error message
   * @param {number} statusCode - HTTP status code
   * @param {string} [code]    - Machine-readable error code for clients
   */
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode >= 400 && statusCode < 500 ? "fail" : "error";
    this.code = code;
    this.isOperational = true;

    // Capture stack trace, excluding this constructor call
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Common Error Factories ────────────────────────────────────────────────
AppError.badRequest = (msg, code) => new AppError(msg, 400, code || "BAD_REQUEST");
AppError.unauthorized = (msg) => new AppError(msg || "Unauthorized", 401, "UNAUTHORIZED");
AppError.forbidden = (msg, code) => new AppError(msg || "Forbidden", 403, code || "FORBIDDEN");
AppError.notFound = (msg) => new AppError(msg || "Resource not found", 404, "NOT_FOUND");
AppError.conflict = (msg, code) => new AppError(msg, 409, code || "CONFLICT");
AppError.tooMany = (msg) => new AppError(msg || "Too many requests", 429, "TOO_MANY_REQUESTS");
AppError.internal = (msg) => new AppError(msg || "Internal server error", 500, "INTERNAL_ERROR");

module.exports = AppError;
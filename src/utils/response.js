/**
 * Send a consistent JSON success response.
 *
 * Shape: { success: true, message, data, meta }
 */
const sendSuccess = (res, { statusCode = 200, message = "Success", data = null, meta = null } = {}) => {
  const payload = { success: true, message };
  if (data !== null) payload.data = data;
  if (meta !== null) payload.meta = meta;
  return res.status(statusCode).json(payload);
};

/**
 * Send a consistent JSON error response.
 *
 * Shape: { success: false, status, code, message, errors? }
 */
const sendError = (res, { statusCode = 500, status = "error", code = "INTERNAL_ERROR", message = "Something went wrong", errors = null } = {}) => {
  const payload = { success: false, status, code, message };
  if (errors) payload.errors = errors;
  return res.status(statusCode).json(payload);
};

module.exports = { sendSuccess, sendError };

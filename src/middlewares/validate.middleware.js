const { sendError } = require("../utils/response");

/**
 * Returns an Express middleware that validates req.body against a Joi schema.
 * On failure: returns 400 with array of field-level errors.
 * On success: strips unknown keys and attaches cleaned value to req.body.
 *
 * @param {Joi.Schema} schema
 */
const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,  // Collect ALL errors, not just first
    stripUnknown: true, // Remove fields not defined in schema
    convert: true,      // Type coercion (e.g. string "true" → boolean)
  });

  if (error) {
    const errors = error.details.map((d) => ({
      field: d.path.join("."),
      message: d.message.replace(/['"]/g, ""),
    }));

    return sendError(res, {
      statusCode: 400,
      status: "fail",
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      errors,
    });
  }

  req.body = value;
  return next();
};

/**
 * Validate query params against a Joi schema (non-destructive — doesn't strip).
 */
const validateQuery = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.query, {
    abortEarly: false,
    convert: true,
    allowUnknown: true,
  });

  if (error) {
    const errors = error.details.map((d) => ({
      field: d.path.join("."),
      message: d.message.replace(/['"]/g, ""),
    }));
    return sendError(res, {
      statusCode: 400,
      status: "fail",
      code: "VALIDATION_ERROR",
      message: "Invalid query parameters",
      errors,
    });
  }

  req.query = value;
  return next();
};

module.exports = { validate, validateQuery };

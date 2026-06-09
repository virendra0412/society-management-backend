/**
 * middlewares/audit.middleware.js
 *
 * Provides two things:
 *
 * 1. audit(action, entity, entityId, changes) — async helper called INSIDE
 *    controllers after the main operation succeeds. Fire-and-forget: it never
 *    throws to the caller; a failed log write is logged to Winston but does
 *    NOT roll back or fail the HTTP response.
 *
 *    Usage inside any controller method:
 *      await audit(req, "member.approved", "User", userId, { flat: "A-101" });
 *
 * 2. auditMiddleware(action, entity, getEntityId?, getChanges?) — Express
 *    middleware factory for routes where the audit context can be derived
 *    automatically from req/res without modifying the controller.
 *    (Currently used as the thin wrapper on notice routes where the controller
 *    isn't being rewritten — see resource.routes.js integration notes.)
 *
 * ─── Fire-and-forget rationale ───────────────────────────────────────────────
 * Audit logging is observational — a failed log write must never cause a
 * successful business operation to appear failed to the user. Winston captures
 * the failure so it can be investigated without impacting UX.
 */

const AuditLog = require("../models/auditLog.model");
const logger   = require("../utils/logger");

// ─── Core writer ─────────────────────────────────────────────────────────────

/**
 * Write one audit log entry. Never throws — swallows and logs any error.
 *
 * @param {object} req        - Express request (for userId, societyId, ip)
 * @param {string} action     - One of AUDIT_ACTIONS
 * @param {string} entity     - Model name (e.g. "User", "Visitor", "Notice")
 * @param {*}      entityId   - ObjectId of the affected document (or null)
 * @param {object} [changes]  - Optional { before, after } or arbitrary metadata
 */
const audit = async (req, action, entity, entityId = null, changes = null) => {
  try {
    await AuditLog.create({
      userId:    req.user?._id   || null,
      societyId: req.societyId   || null,
      action,
      entity,
      entityId:  entityId        || null,
      changes:   changes         || null,
      ip:        req.ip          || req.headers["x-forwarded-for"] || null,
    });
  } catch (err) {
    // Never surface this to the caller
    logger.error("[Audit] Failed to write audit log", {
      action,
      entity,
      entityId: entityId?.toString?.(),
      error: err.message,
    });
  }
};

// ─── Middleware factory (for routes that don't need controller changes) ────────

/**
 * Returns an Express middleware that runs AFTER the route handler has sent
 * a successful response, then writes the audit log asynchronously.
 *
 * getEntityId(req, res) and getChanges(req, res) are optional functions
 * that extract the entityId / changes from the request or response locals.
 *
 * @param {string}   action
 * @param {string}   entity
 * @param {Function} [getEntityId]  - (req) => ObjectId | string | null
 * @param {Function} [getChanges]   - (req) => object | null
 */
const auditMiddleware = (action, entity, getEntityId = null, getChanges = null) =>
  (req, res, next) => {
    // Intercept res.json to capture the response data, then write the audit log
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      // Call the original first so the response is sent
      const result = originalJson(body);

      // Only log on success (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entityId = getEntityId ? getEntityId(req, body) : null;
        const changes  = getChanges  ? getChanges(req, body)  : null;
        audit(req, action, entity, entityId, changes);
      }

      return result;
    };

    next();
  };

module.exports = { audit, auditMiddleware };
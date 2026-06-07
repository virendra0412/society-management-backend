const AppError = require("../utils/AppError");

/**
 * Resolves the effective permission level for a module.
 * Uses JWT-cached permissions on the request when available (fast path),
 * falls back to scanning user.memberships if not.
 * Admins implicitly have "full" on every module.
 */
const _getEffectivePermission = (req, module) => {
  const user = req.user;
  if (!user) return "none";

  // Admin role → full bypass
  if (req.role === "admin" || user.role === "admin") return "full";

  // Fast path: permissions pre-loaded from JWT into req.permissions
  if (req.permissions && req.permissions[module] !== undefined) {
    return req.permissions[module];
  }

  // Fallback: scan memberships for the active society
  const societyId = req.societyId;
  const membership = user.memberships?.find(
    (m) => m.society?.toString() === societyId?.toString() && m.isActive
  );
  if (!membership) return "none";
  if (membership.role === "admin") return "full";

  return membership.permissions?.[module] || "none";
};

/**
 * Restrict access to specific roles.
 * Must be used AFTER protect() middleware.
 *
 * Usage:
 *   router.post("/notices", protect, requireRole("admin"), handler)
 *   router.get("/admin/members", protect, requireRole("admin", "committee"), handler)
 *
 * Note: For committee members you generally want requirePermission() instead,
 * since their access is defined by granular permissions, not just role name.
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    throw AppError.unauthorized("Authentication required");
  }

  if (!roles.includes(req.user.role)) {
    throw AppError.forbidden(
      `Access denied. This action requires one of the following roles: ${roles.join(", ")}.`
    );
  }

  next();
};

/**
 * Granular module-permission checker.
 * Supports 4 levels: none < read < write < full
 *
 * Usage:
 *   requirePermission("maintenance", "write")   → allows write + full
 *   requirePermission("visitors", "read")        → allows read + write + full
 *   requirePermission("maintenance", "full")     → only full
 *
 * Permission resolution order:
 *   1. Admin role → always passes (full bypass)
 *   2. Membership.permissions[module] level checked against required level
 *
 * Must be used AFTER protect() + requireSociety() middleware.
 */
const LEVEL_ORDER = ["none", "read", "write", "full"];

const requirePermission = (module, level) => (req, res, next) => {
  if (!req.user) {
    throw AppError.unauthorized("Authentication required");
  }

  const effectivePerm = _getEffectivePermission(req, module);
  const required = LEVEL_ORDER.indexOf(level);
  const actual   = LEVEL_ORDER.indexOf(effectivePerm);

  if (actual < 1 || actual < required) {
    throw AppError.forbidden(
      `Insufficient permissions. '${level}' access to '${module}' is required.`
    );
  }

  next();
};

/**
 * Ensures the requesting user is either:
 *   (a) the resource owner (their own record), OR
 *   (b) an admin OR a committee member with at least "write" on the given module
 *
 * Usage:
 *   requireOwnerOrAdmin(getIssueOwnerId)
 *   requireOwnerOrAdmin(getIssueOwnerId, "issues")  // committee with issues:write also passes
 *
 * @param {Function} getOwnerId        - async fn(req) → ObjectId of the resource owner
 * @param {string}   [moduleForPerms]  - optional module to check committee write permission
 */
const requireOwnerOrAdmin = (getOwnerId, moduleForPerms = null) => async (req, res, next) => {
  if (!req.user) throw AppError.unauthorized();

  // Admin always passes
  if (req.user.role === "admin") return next();

  // Committee member with write permission on the module also passes
  if (moduleForPerms && req.user.role === "committee") {
    const perm = _getEffectivePermission(req, moduleForPerms);
    const idx  = LEVEL_ORDER.indexOf(perm);
    if (idx >= LEVEL_ORDER.indexOf("write")) return next();
  }

  const ownerId = await getOwnerId(req);
  if (!ownerId) throw AppError.notFound();

  if (ownerId.toString() !== req.user._id.toString()) {
    throw AppError.forbidden("You can only modify your own resources.");
  }

  next();
};

module.exports = { requireRole, requirePermission, requireOwnerOrAdmin };
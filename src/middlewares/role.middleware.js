const AppError = require("../utils/AppError");

/**
 * Restrict access to specific roles.
 * Must be used AFTER protect() middleware.
 *
 * Usage:
 *   router.post("/notices", protect, requireRole("admin"), handler)
 *   router.get("/admin/members", protect, requireRole("admin", "vendor"), handler)
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
 * Ensures the requesting user is either:
 *   (a) the resource owner (their own record), OR
 *   (b) an admin
 *
 * Usage:
 *   router.patch("/issues/:id", protect, requireOwnerOrAdmin(getIssueOwnerId), handler)
 *
 * @param {Function} getOwnerId - async fn(req) → ObjectId of the resource owner
 */
const requireOwnerOrAdmin = (getOwnerId) => async (req, res, next) => {
  if (!req.user) throw AppError.unauthorized();

  if (req.user.role === "admin") return next();

  const ownerId = await getOwnerId(req);
  if (!ownerId) throw AppError.notFound();

  if (ownerId.toString() !== req.user._id.toString()) {
    throw AppError.forbidden("You can only modify your own resources.");
  }

  next();
};

module.exports = { requireRole, requireOwnerOrAdmin };

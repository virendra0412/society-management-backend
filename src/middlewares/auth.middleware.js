const { extractBearerToken, verifyAccessToken } = require("../utils/token");
const userRepository = require("../repositories/user.repository");
const AppError = require("../utils/AppError");

/**
 * Protects routes — requires a valid Bearer access token.
 * Attaches req.user (full user doc), req.societyId (from JWT), and req.role.
 *
 * societyId is read from the JWT payload (set at login / switch-society),
 * NOT derived from user.society — this is critical for multi-society support.
 */
const protect = async (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    throw AppError.unauthorized("Authentication required. Please log in.");
  }

  // Verify signature and expiry
  const decoded = verifyAccessToken(token);

  // Check user still exists and is active
  const user = await userRepository.findById(decoded.userId, true);
  if (!user || !user.isActive) {
    throw AppError.unauthorized("This account no longer exists or has been deactivated.");
  }

  // Ensure token wasn't issued before a password change
  if (!user.isTokenIssuedAfterPasswordChange(decoded.iat)) {
    throw AppError.unauthorized("Password was recently changed. Please log in again.");
  }

  // societyId, role and permissions come from the JWT payload (active society context)
  req.user = user;
  req.societyId = decoded.societyId || null;
  req.role = decoded.role || null;
  req.permissions = decoded.permissions || null;

  next();
};

/**
 * Optional auth — if a token is present, authenticate; otherwise continue.
 */
const optionalProtect = async (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return next();

  try {
    const decoded = verifyAccessToken(token);
    const user = await userRepository.findById(decoded.userId);
    if (user && user.isActive) {
      req.user = user;
      req.societyId = decoded.societyId || null;
      req.role = decoded.role || null;
    }
  } catch {
    // Silently ignore invalid tokens for optional auth
  }
  next();
};

/**
 * Ensure the authenticated user belongs to a society and is approved.
 * Validates against the active society from the JWT (req.societyId).
 * Must come after protect().
 */
const requireSociety = (req, res, next) => {
  if (!req.societyId) {
    throw AppError.forbidden("You must be a member of a society to access this resource.");
  }

  // Verify the JWT's societyId is a valid, approved membership on the user doc
  const membership = req.user.getMembership(req.societyId);
  if (!membership) {
    throw AppError.forbidden("You are not a member of this society.");
  }
  if (!membership.isApproved) {
    throw AppError.forbidden("Your membership is pending approval by the society admin.");
  }

  next();
};

module.exports = { protect, optionalProtect, requireSociety };
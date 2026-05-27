const { extractBearerToken, verifyAccessToken } = require("../utils/token");
const userRepository = require("../repositories/user.repository");
const AppError = require("../utils/AppError");

/**
 * Protects routes — requires a valid Bearer access token.
 * Attaches req.user (full user doc) and req.societyId.
 *
 * Checks:
 *  1. Token exists and is valid JWT
 *  2. User still exists and is active
 *  3. Token was issued AFTER any password change (token invalidation)
 *  4. User is approved member of a society
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

  // Attach to request for downstream use
  req.user = user;
  req.societyId = user.society?._id || user.society || null;

  next();
};

/**
 * Optional auth — if a token is present, authenticate; otherwise continue.
 * Used for routes accessible to guests but with enhanced features for logged-in users.
 */
const optionalProtect = async (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return next();

  try {
    const decoded = verifyAccessToken(token);
    const user = await userRepository.findById(decoded.userId);
    if (user && user.isActive) {
      req.user = user;
      req.societyId = user.society?._id || user.society || null;
    }
  } catch {
    // Silently ignore invalid tokens for optional auth
  }
  next();
};

/**
 * Ensure the authenticated user belongs to a society.
 * Must come after protect().
 */
const requireSociety = (req, res, next) => {
  if (!req.societyId) {
    throw AppError.forbidden("You must be a member of a society to access this resource.");
  }
  if (!req.user.isApproved) {
    throw AppError.forbidden("Your membership is pending approval by the society admin.");
  }
  next();
};

module.exports = { protect, optionalProtect, requireSociety };

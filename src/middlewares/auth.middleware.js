const { extractBearerToken, verifyAccessToken } = require("../utils/token");

// ─── Token extraction ─────────────────────────────────────────────────────────
// Report endpoints are opened directly in the device browser (expo-web-browser),
// which cannot set Authorization headers. We allow the JWT as a ?token= query
// param ONLY for GET requests to /maintenance/reports/* so report downloads work.
const _extractToken = (req) => {
  // Primary: Authorization header (all API calls)
  const fromHeader = extractBearerToken(req.headers.authorization);
  if (fromHeader) return fromHeader;

  // Secondary: ?token= query param — report browser-view only
  if (req.method === "GET" && req.query.token) {
    return req.query.token;
  }
  return null;
};
const userRepository = require("../repositories/user.repository");
const AppError = require("../utils/AppError");
const { Society } = require("../models/society.model");

/**
 * Protects routes — requires a valid Bearer access token.
 * Attaches req.user (full user doc), req.societyId (from JWT), and req.role.
 *
 * societyId is read from the JWT payload (set at login / switch-society),
 * NOT derived from user.society — this is critical for multi-society support.
 */
const protect = async (req, res, next) => {
  const token = _extractToken(req);
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
 * Also checks society.isActive so a mid-session suspension returns 403
 * immediately rather than letting the request through. (EDGE-01)
 * Must come after protect().
 */
const requireSociety = async (req, res, next) => {
  if (!req.societyId) {
    return next(AppError.forbidden("You must be a member of a society to access this resource."));
  }

  // Verify the JWT's societyId is a valid, approved membership on the user doc
  const membership = req.user.getMembership(req.societyId);
  if (!membership) {
    return next(AppError.forbidden("You are not a member of this society."));
  }
  // TC-MS-004: distinguish rejected (isApproved:false) from merely inactive
  // so the client can show "Your membership was rejected" instead of the
  // generic pending-approval message.
  if (!membership.isApproved) {
    const isPending = membership.isActive !== false;
    const msg = isPending
      ? "Your membership is pending approval by the society admin."
      : "Your membership request was rejected by the society admin.";
    const code = isPending ? "MEMBERSHIP_PENDING" : "MEMBERSHIP_REJECTED";
    return next(AppError.forbidden(msg, code));
  }

  // EDGE-01: check society is still active — SA may suspend mid-session.
  // Lean query for minimal overhead; only fetches the isActive flag.
  const society = await Society.findById(req.societyId, "isActive").lean();
  if (!society) {
    return next(AppError.forbidden("Society not found."));
  }
  if (!society.isActive) {
    return next(AppError.forbidden("Society account is suspended."));
  }

  next();
};

module.exports = { protect, optionalProtect, requireSociety };
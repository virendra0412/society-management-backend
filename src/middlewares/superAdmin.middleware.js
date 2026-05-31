/**
 * Super Admin Middleware
 *
 * Uses a SEPARATE JWT secret (SUPER_ADMIN_JWT_SECRET) from the regular user
 * JWT secret. This means:
 *   • A regular user's access token is cryptographically rejected here.
 *   • A super admin token is rejected by the regular protect() middleware.
 *   • There is zero cross-contamination between the two auth systems.
 */
const jwt       = require("jsonwebtoken");
const SuperAdmin = require("../models/superAdmin.model");
const AppError  = require("../utils/AppError");
const { superAdmin: saCfg } = require("../config/env");

const ISSUER = "society-app-superadmin";

// ─── Token helpers ────────────────────────────────────────────────────────────

const signSuperAdminAccessToken = (payload) =>
  jwt.sign(payload, saCfg.jwtSecret, {
    expiresIn: saCfg.jwtExpiresIn,
    issuer:    ISSUER,
  });

const signSuperAdminRefreshToken = (payload) =>
  jwt.sign(payload, saCfg.jwtRefreshSecret, {
    expiresIn: saCfg.jwtRefreshExpiresIn,
    issuer:    ISSUER,
  });

const verifySuperAdminAccessToken = (token) => {
  try {
    return jwt.verify(token, saCfg.jwtSecret, { issuer: ISSUER });
  } catch (err) {
    if (err.name === "TokenExpiredError") throw AppError.unauthorized("Super admin access token expired.");
    throw AppError.unauthorized("Invalid super admin access token.");
  }
};

const verifySuperAdminRefreshToken = (token) => {
  try {
    return jwt.verify(token, saCfg.jwtRefreshSecret, { issuer: ISSUER });
  } catch (err) {
    if (err.name === "TokenExpiredError") throw AppError.unauthorized("Super admin refresh token expired.");
    throw AppError.unauthorized("Invalid super admin refresh token.");
  }
};

// ─── Protect middleware ───────────────────────────────────────────────────────

/**
 * Guards all /api/v1/superadmin/* routes.
 * Attaches req.superAdmin on success.
 */
const protectSuperAdmin = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    throw AppError.unauthorized("Super admin authentication required.");
  }

  const token   = auth.split(" ")[1];
  const decoded = verifySuperAdminAccessToken(token);

  const sa = await SuperAdmin.findById(decoded.superAdminId).select(
    "+refreshTokenHash +passwordChangedAt"
  );
  if (!sa || !sa.isActive) {
    throw AppError.unauthorized("Super admin account not found or deactivated.");
  }

  if (sa.passwordChangedAt) {
    const changedTs = Math.floor(sa.passwordChangedAt.getTime() / 1000);
    if (changedTs > decoded.iat) {
      throw AppError.unauthorized("Password changed. Please log in again.");
    }
  }

  req.superAdmin = sa;
  next();
};

module.exports = {
  protectSuperAdmin,
  signSuperAdminAccessToken,
  signSuperAdminRefreshToken,
  verifySuperAdminRefreshToken,
};

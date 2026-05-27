const jwt = require("jsonwebtoken");
const { jwt: jwtConfig } = require("../config/env");
const AppError = require("./AppError");

/**
 * Sign an access token (short-lived).
 * Payload: userId, societyId, role
 */
const signAccessToken = (payload) =>
  jwt.sign(payload, jwtConfig.accessSecret, {
    expiresIn: jwtConfig.accessExpiresIn,
    issuer: "society-app",
  });

/**
 * Sign a refresh token (long-lived, stored in DB).
 * Payload: userId only — minimal data in long-lived tokens.
 */
const signRefreshToken = (payload) =>
  jwt.sign(payload, jwtConfig.refreshSecret, {
    expiresIn: jwtConfig.refreshExpiresIn,
    issuer: "society-app",
  });

/**
 * Verify an access token. Throws AppError on failure.
 */
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, jwtConfig.accessSecret, { issuer: "society-app" });
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw AppError.unauthorized("Access token expired");
    }
    throw AppError.unauthorized("Invalid access token");
  }
};

/**
 * Verify a refresh token. Throws AppError on failure.
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, jwtConfig.refreshSecret, { issuer: "society-app" });
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw AppError.unauthorized("Refresh token expired. Please log in again.");
    }
    throw AppError.unauthorized("Invalid refresh token");
  }
};

/**
 * Extract raw token from "Bearer <token>" Authorization header.
 */
const extractBearerToken = (authHeader) => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.split(" ")[1];
};

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  extractBearerToken,
};

const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { protect } = require("../middlewares/auth.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { authLimiter } = require("../middlewares/rateLimiter.middleware");
const { register, login, refreshToken, forgotPassword, resetPassword } = require("../validators/auth.validator");

// Apply strict rate limiting to all auth routes
router.use(authLimiter);

router.post("/register", validate(register), authController.register);
router.post("/login", validate(login), authController.login);
router.post("/refresh-token", validate(refreshToken), authController.refreshToken);

// ── NEW: Forgot / reset password (OTP flow) ────────────────────────────────
router.post("/forgot-password", validate(forgotPassword), authController.forgotPassword);
router.post("/reset-password", validate(resetPassword), authController.resetPassword);

// Protected routes
router.post("/logout", protect, authController.logout);
router.get("/me", protect, authController.getMe);

module.exports = router;

const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { protect } = require("../middlewares/auth.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { authLimiter } = require("../middlewares/rateLimiter.middleware");
const {
  register,
  login,
  refreshToken,
  forgotPassword,
  resetPassword,
  switchSociety,
  joinSociety,
  changePassword,
} = require("../validators/auth.validator");

// Apply strict rate limiting to all auth routes
router.use(authLimiter);

router.post("/register",       validate(register),       authController.register);
router.post("/login",          validate(login),          authController.login);
router.post("/refresh-token",  validate(refreshToken),   authController.refreshToken);
router.post("/forgot-password",validate(forgotPassword), authController.forgotPassword);
router.post("/reset-password", validate(resetPassword),  authController.resetPassword);

// Protected routes
router.post("/logout",         protect, authController.logout);
router.get("/me",              protect, authController.getMe);

// Protected routes
router.patch("/change-password", protect, validate(changePassword), authController.changePassword);

// Multi-society
router.post("/switch-society", protect, validate(switchSociety), authController.switchSociety);
router.post("/join-society",   protect, validate(joinSociety),   authController.joinSociety);

module.exports = router;
const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { profile, familyMember } = require("../validators/resource.validator");
const { uploadSingle } = require("../middlewares/upload.middleware");

router.use(protect); // All user routes require authentication

// ── Profile ────────────────────────────────────────────────────────────────
router.get("/profile", userController.getProfile);
router.patch("/profile", validate(profile.update), userController.updateProfile);

// ── NEW: Avatar upload ─────────────────────────────────────────────────────
router.post(
  "/profile/avatar",
  uploadSingle("avatar"),       // multer middleware — field name "avatar"
  userController.uploadAvatar
);

// ── NEW: Family members ────────────────────────────────────────────────────
router.post(
  "/profile/family",
  validate(familyMember.create),
  userController.addFamilyMember
);
router.patch(
  "/profile/family/:memberId",
  validate(familyMember.update),
  userController.updateFamilyMember
);
router.delete(
  "/profile/family/:memberId",
  userController.removeFamilyMember
);

// ── NEW: Admin — member approval panel ────────────────────────────────────
router.get(
  "/pending",
  requireSociety,
  requireRole("admin"),
  userController.getPendingMembers
);
router.patch(
  "/:userId/approve",
  requireSociety,
  requireRole("admin"),
  userController.approveMember
);
router.patch(
  "/:userId/reject",
  requireSociety,
  requireRole("admin"),
  userController.rejectMember
);

// ── FCM Token — store device push token ───────────────────────────────────
// Call on every login / app-open with { fcmToken: "<device-token>" }
// Call with { fcmToken: null } on logout to stop receiving notifications
router.patch("/fcm-token", userController.updateFcmToken);

module.exports = router;

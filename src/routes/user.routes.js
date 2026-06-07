const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requireRole, requirePermission } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { profile, familyMember } = require("../validators/resource.validator");
const { uploadSingle } = require("../middlewares/upload.middleware");

router.use(protect); // All user routes require authentication

// ── Profile ────────────────────────────────────────────────────────────────
router.get("/profile", userController.getProfile);
router.patch("/profile", validate(profile.update), userController.updateProfile);

// ── Avatar upload ─────────────────────────────────────────────────────────
router.post(
  "/profile/avatar",
  uploadSingle("avatar"),
  userController.uploadAvatar
);

// ── Family members ────────────────────────────────────────────────────────
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

// ── Admin — member approval panel ─────────────────────────────────────────
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

// ── Committee management (Admin only) ─────────────────────────────────────
// GET  /users/committee         → list all committee members with titles & perms
// POST /users/:userId/committee → assign/update committee role + permissions
// DELETE /users/:userId/committee → demote back to resident

router.get(
  "/committee",
  requireSociety,
  requireRole("admin"),
  userController.getCommitteeMembers
);

router.post(
  "/:userId/committee",
  requireSociety,
  requireRole("admin"),
  userController.assignCommitteeRole
);

router.delete(
  "/:userId/committee",
  requireSociety,
  requireRole("admin"),
  userController.removeCommitteeRole
);

// ── FCM Token ─────────────────────────────────────────────────────────────
router.patch("/fcm-token", userController.updateFcmToken);

module.exports = router;
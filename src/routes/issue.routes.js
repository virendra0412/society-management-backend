const express = require("express");
const router = express.Router();
const issueController = require("../controllers/issue.controller");
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { issue } = require("../validators/resource.validator");
const { uploadSingle } = require("../middlewares/upload.middleware");

router.use(protect, requireSociety);

router.post("/", validate(issue.create), issueController.create);
router.get("/", issueController.getAll);
router.get("/:id", issueController.getOne);
router.patch("/:id", validate(issue.update), issueController.update);
router.post("/:id/comments", validate(issue.comment), issueController.addComment);

// ── NEW: Photo upload for an issue ────────────────────────────────────────
router.post(
  "/:id/photos",
  uploadSingle("photo"),          // multer field name "photo"
  issueController.uploadPhoto
);

// ── NEW: Assign external vendor (admin only) ──────────────────────────────
router.patch(
  "/:id/vendor",
  requireRole("admin"),
  validate(issue.assignVendor),
  issueController.assignVendor
);

module.exports = router;

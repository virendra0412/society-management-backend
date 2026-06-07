const express = require("express");
const router = express.Router();
const issueController = require("../controllers/issue.controller");
const { protect, requireSociety } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { issue } = require("../validators/resource.validator");
const { uploadSingle } = require("../middlewares/upload.middleware");

router.use(protect, requireSociety);

// All residents can create/view issues
router.post("/", validate(issue.create), issueController.create);
router.get("/", issueController.getAll);
router.get("/:id", issueController.getOne);
router.patch("/:id", validate(issue.update), issueController.update);
router.post("/:id/comments", validate(issue.comment), issueController.addComment);

// Photo upload for an issue
router.post(
  "/:id/photos",
  uploadSingle("photo"),
  issueController.uploadPhoto
);

// Assign external vendor — requires issues:write (Maintenance Head / Admin)
router.patch(
  "/:id/vendor",
  requirePermission("issues", "write"),
  validate(issue.assignVendor),
  issueController.assignVendor
);

module.exports = router;
const multer = require("multer");
const AppError = require("../utils/AppError");

// Store in memory — Cloudinary SDK will read from buffer
const storage = multer.memoryStorage();

// Only accept images; reject everything else at the multer level
const fileFilter = (req, file, cb) => {
  const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic"];
  if (ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      AppError.badRequest("Only JPEG, PNG, WEBP, and HEIC images are allowed."),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB per file
    files: 1,
  },
});

/**
 * Single-file upload middleware.
 * @param {string} fieldName — the multipart form field name
 */
const uploadSingle = (fieldName) => (req, res, next) => {
  upload.single(fieldName)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(AppError.badRequest("File too large. Maximum size is 5 MB."));
      }
      return next(AppError.badRequest(err.message));
    }
    if (err) return next(err);
    next();
  });
};

module.exports = { uploadSingle };

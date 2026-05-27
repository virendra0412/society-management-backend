const cloudinary = require("cloudinary").v2;
const { cloudinaryConfig } = require("../config/env");
const AppError = require("./AppError");

// Configure only when credentials are present
const isConfigured =
  cloudinaryConfig.cloudName && cloudinaryConfig.apiKey && cloudinaryConfig.apiSecret;

if (isConfigured) {
  cloudinary.config({
    cloud_name: cloudinaryConfig.cloudName,
    api_key:    cloudinaryConfig.apiKey,
    api_secret: cloudinaryConfig.apiSecret,
    secure: true,
  });
}

/**
 * Upload a file buffer to Cloudinary.
 *
 * @param {Buffer} buffer — file buffer from multer memoryStorage
 * @param {object} options — Cloudinary upload options (folder, public_id, transformation, etc.)
 * @returns {Promise<object>} Cloudinary upload result (use result.secure_url)
 */
const uploadToCloudinary = (buffer, options = {}) => {
  if (!isConfigured) {
    return Promise.reject(
      AppError.badRequest(
        "Image upload is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file."
      )
    );
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        ...options,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
};

/**
 * Delete an asset from Cloudinary by its public_id.
 *
 * @param {string} publicId — Cloudinary public_id
 */
const deleteFromCloudinary = (publicId) => {
  return cloudinary.uploader.destroy(publicId);
};

module.exports = { uploadToCloudinary, deleteFromCloudinary };

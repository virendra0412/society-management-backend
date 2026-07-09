/**
 * services/paymentSettings.service.js
 *
 * Manages which payment methods a society accepts for maintenance collections
 * and stores the relevant details (bank account, UPI QR, cheque instructions).
 *
 * Admin configures once; residents see these details on every bill they view.
 *
 * Methods:
 *   getSettings        — return society's current payment settings
 *   updateSettings     — toggle accepted methods + update text-based details
 *   uploadUpiQr        — upload / replace UPI QR image (Cloudinary)
 */

const { Society }                          = require("../models/society.model");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudinary");
const AppError                             = require("../utils/AppError");

class PaymentSettingsService {
  _getSocietyId(user) {
    return user.society?._id || user.society;
  }

  // ── Get current payment settings ────────────────────────────────────────────

  async getSettings(user) {
    const societyId = this._getSocietyId(user);
    const society = await Society
      .findById(societyId, "paymentSettings paymentVerificationEnabled name")
      .lean();
    if (!society) throw AppError.notFound("Society not found.");
    return {
      paymentSettings:          society.paymentSettings || {},
      // Default true so societies created before this field existed behave correctly
      paymentVerificationEnabled: society.paymentVerificationEnabled !== false,
    };
  }

  // ── Update text-based settings ──────────────────────────────────────────────
  // Handles: acceptedMethods, bankTransfer details, cheque/cash instructions,
  // and upiQr.upiId. The QR image is handled separately via uploadUpiQr().

  async updateSettings(updates, adminUser) {
    const societyId = this._getSocietyId(adminUser);

    const allowed = ["acceptedMethods", "bankTransfer", "upiQr", "chequeInstructions", "cashInstructions"];
    const setObj  = {};

    for (const key of allowed) {
      if (updates[key] === undefined) continue;

      if (key === "upiQr") {
        // Only allow upiId from here — qrImageUrl is managed by uploadUpiQr()
        if (updates.upiQr.upiId !== undefined) {
          setObj["paymentSettings.upiQr.upiId"] = updates.upiQr.upiId;
        }
      } else if (key === "bankTransfer" && typeof updates.bankTransfer === "object") {
        const allowed_bank = ["accountHolderName", "accountNumber", "ifscCode", "bankName", "branchName"];
        for (const f of allowed_bank) {
          if (updates.bankTransfer[f] !== undefined) {
            setObj[`paymentSettings.bankTransfer.${f}`] = updates.bankTransfer[f];
          }
        }
      } else {
        setObj[`paymentSettings.${key}`] = updates[key];
      }
    }

    if (Object.keys(setObj).length === 0) {
      throw AppError.badRequest("No valid fields to update.");
    }

    const society = await Society.findByIdAndUpdate(
      societyId,
      { $set: setObj },
      { new: true, runValidators: true }
    ).select("paymentSettings").lean();

    if (!society) throw AppError.notFound("Society not found.");
    return society.paymentSettings;
  }

  // ── Upload / replace UPI QR image ───────────────────────────────────────────

  async uploadUpiQr(file, adminUser) {
    if (!file) throw AppError.badRequest("No image file provided.");

    const societyId = this._getSocietyId(adminUser);
    const society   = await Society.findById(societyId, "paymentSettings").lean();
    if (!society) throw AppError.notFound("Society not found.");

    // Delete old QR image from Cloudinary if one already exists
    const existingPublicId = society.paymentSettings?.upiQr?.qrImagePublicId;
    if (existingPublicId) {
      await deleteFromCloudinary(existingPublicId).catch(() => {
        // Non-fatal — old image may already be gone; continue with upload.
      });
    }

    const result = await uploadToCloudinary(file.buffer, {
      folder:    `society-app/upi-qr`,
      public_id: `upi_qr_${societyId}`,
      overwrite: true,
    });

    const updated = await Society.findByIdAndUpdate(
      societyId,
      {
        $set: {
          "paymentSettings.upiQr.qrImageUrl":    result.secure_url,
          "paymentSettings.upiQr.qrImagePublicId": result.public_id,
        },
      },
      { new: true }
    ).select("paymentSettings").lean();

    return updated.paymentSettings.upiQr;
  }
}

module.exports = new PaymentSettingsService();

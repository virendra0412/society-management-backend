/**
 * controllers/paymentSettings.controller.js
 *
 * Admin configures the society's maintenance payment methods once.
 * Residents read these settings when viewing a bill (to know where to transfer).
 *
 * Routes (mounted at /api/v1/maintenance/payment-settings):
 *
 *   GET    /            → get current settings (admin OR resident — residents need
 *                          to see the bank account / UPI ID when they pay)
 *   PATCH  /            → update text-based settings (admin only)
 *   POST   /upi-qr      → upload / replace UPI QR image (admin only)
 */

const paymentSettingsService = require("../services/paymentSettings.service");
const { sendSuccess }        = require("../utils/response");
const { audit }              = require("../middlewares/audit.middleware");
const { Society }            = require("../models/society.model");
const AppError               = require("../utils/AppError");

class PaymentSettingsController {

  // ── GET — admin or resident reads current settings ─────────────────────────
  // Residents need this to see where to transfer and what reference to quote.
  // Also returns paymentVerificationEnabled so mobile can gate the UI correctly.
  async getSettings(req, res) {
    const { paymentSettings, paymentVerificationEnabled } =
      await paymentSettingsService.getSettings(req.user);
    return sendSuccess(res, {
      data: { paymentSettings, paymentVerificationEnabled },
    });
  }

  // ── PATCH — admin updates text-based settings ──────────────────────────────
  async updateSettings(req, res) {
    const settings = await paymentSettingsService.updateSettings(req.body, req.user);

    await audit(req, "payment_settings.updated", "Society", req.societyId, {
      updatedFields: Object.keys(req.body),
    });

    return sendSuccess(res, {
      message: "Payment settings updated.",
      data: { paymentSettings: settings },
    });
  }

  // ── POST /upi-qr — admin uploads UPI QR image ──────────────────────────────
  async uploadUpiQr(req, res) {
    const upiQr = await paymentSettingsService.uploadUpiQr(req.file, req.user);

    await audit(req, "payment_settings.upi_qr_uploaded", "Society", req.societyId, {});

    return sendSuccess(res, {
      message: "UPI QR image uploaded.",
      data: { upiQr },
    });
  }
}

module.exports = new PaymentSettingsController();

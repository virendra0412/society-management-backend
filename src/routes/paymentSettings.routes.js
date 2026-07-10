/**
 * routes/paymentSettings.routes.js
 *
 * Base path: /api/v1/maintenance/payment-settings
 *
 *   GET    /            → any member reads the society's payment methods / details
 *   PATCH  /            → admin updates text-based settings
 *   POST   /upi-qr      → admin uploads / replaces UPI QR image
 *
 * Mounted inside maintenance.routes.js (same module gate):
 *   router.use("/payment-settings", paymentSettingsRouter);
 */

const express                 = require("express");
const router                  = express.Router();
const paymentSettingsCtrl     = require("../controllers/paymentSettings.controller");
const { requirePermission }   = require("../middlewares/role.middleware");
const { validate }            = require("../middlewares/validate.middleware");
const { uploadSingle }        = require("../middlewares/upload.middleware");
const Joi                     = require("joi");
const { PAYMENT_METHOD_KEYS } = require("../models/society.model");

// ── Validators ───────────────────────────────────────────────────────────────

const updateSettingsSchema = Joi.object({
  acceptedMethods: Joi.array()
    .items(Joi.string().valid(...PAYMENT_METHOD_KEYS))
    .min(1)
    .optional()
    .messages({ "array.min": "At least one payment method must be accepted." }),

  bankTransfer: Joi.object({
    accountHolderName: Joi.string().max(150).trim().optional().allow(""),
    accountNumber:     Joi.string().max(30).trim().optional().allow(""),
    ifscCode:          Joi.string().max(15).trim().uppercase().optional().allow(""),
    bankName:          Joi.string().max(150).trim().optional().allow(""),
    branchName:        Joi.string().max(150).trim().optional().allow(""),
  }).optional(),

  upiQr: Joi.object({
    upiId: Joi.string().max(100).trim().optional().allow(""),
    // qrImageUrl is managed by the /upi-qr upload endpoint, not this schema
  }).optional(),

  chequeInstructions: Joi.string().max(500).trim().optional().allow(""),
  cashInstructions:   Joi.string().max(500).trim().optional().allow(""),
  paymentVerificationEnabled: Joi.boolean().optional(),
}).min(1);

// ── Routes ───────────────────────────────────────────────────────────────────

// All members can read settings (residents need bank details to know where to pay)
router.get("/", paymentSettingsCtrl.getSettings);

// Only admin/treasurer can change settings
router.patch(
  "/",
  requirePermission("maintenance", "write"),
  validate(updateSettingsSchema),
  paymentSettingsCtrl.updateSettings
);

// Upload / replace the UPI QR image
router.post(
  "/upi-qr",
  requirePermission("maintenance", "write"),
  uploadSingle("qrImage"),
  paymentSettingsCtrl.uploadUpiQr
);

module.exports = router;

/**
 * config/razorpay.js
 *
 * Lazy-initialized Razorpay SDK client — follows the same optional-config
 * pattern as cloudinary.js and firebase admin in this codebase.
 *
 * If RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set, payment routes will
 * throw a clear 503 error instead of crashing the whole server on boot.
 * This lets you run the app without payments configured during early dev.
 *
 * ── Getting demo/test keys ──────────────────────────────────────────────────
 * 1. Sign up at https://dashboard.razorpay.com (no business docs needed for
 *    Test Mode).
 * 2. Dashboard → Settings → API Keys → Generate Test Key.
 * 3. Copy Key Id (rzp_test_xxxxx) and Key Secret into your .env.
 * 4. Test card: 4111 1111 1111 1111, any future expiry, any CVV, any OTP.
 * 5. Test UPI: success@razorpay
 */
const Razorpay = require("razorpay");
const logger   = require("../utils/logger");

const {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
} = process.env;

const isConfigured = Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);

let instance = null;

if (isConfigured) {
  instance = new Razorpay({
    key_id:     RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
  });
  logger.info("[Razorpay] SDK initialized", {
    mode: RAZORPAY_KEY_ID.startsWith("rzp_live_") ? "LIVE" : "TEST",
  });
} else {
  logger.warn(
    "[Razorpay] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — payment routes will return 503 until configured."
  );
}

/**
 * Returns the Razorpay SDK instance, or throws AppError(503) if not configured.
 * Call this inside service methods rather than importing `instance` directly,
 * so the error surfaces as a clean API response instead of a crash.
 */
const getRazorpayClient = () => {
  if (!instance) {
    const AppError = require("../utils/AppError");
    throw new AppError(
      "Payments are not configured on this server yet.",
      503,
      "PAYMENTS_NOT_CONFIGURED"
    );
  }
  return instance;
};

module.exports = { getRazorpayClient, isConfigured, keyId: RAZORPAY_KEY_ID || null };
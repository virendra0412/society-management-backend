/**
 * middlewares/razorpayWebhook.middleware.js
 *
 * Razorpay webhook signatures are computed over the EXACT raw request bytes.
 * If you let express.json() parse the body first, the bytes are gone and
 * signature verification will always fail (re-serialized JSON is not
 * byte-identical to what Razorpay sent).
 *
 * This is why the webhook route in app.js is mounted with express.raw()
 * BEFORE the global express.json() middleware runs (see app.js comments).
 *
 * Flow:
 *   1. express.raw({ type: "application/json" }) gives us req.body as a Buffer.
 *   2. This middleware verifies the HMAC signature against that raw Buffer.
 *   3. On success, JSON.parse the buffer and replace req.body with the
 *      parsed object so the controller can use it normally.
 *   4. On failure, respond 400 immediately — never let an unsigned/forged
 *      payload reach paymentService.
 */
const paymentService = require("../services/payment.service");
const logger          = require("../utils/logger");

const razorpayWebhookAuth = (req, res, next) => {
  const signature = req.headers["x-razorpay-signature"];

  if (!signature) {
    logger.warn("[Webhook] Missing x-razorpay-signature header — rejected.");
    return res.status(400).json({ success: false, message: "Missing signature." });
  }

  if (!Buffer.isBuffer(req.body)) {
    // Misconfiguration guard — should never happen if app.js wiring is correct.
    logger.error("[Webhook] req.body is not a raw Buffer — check express.raw() is mounted before this route.");
    return res.status(500).json({ success: false, message: "Webhook misconfigured." });
  }

  const isValid = paymentService.verifyWebhookSignature(req.body, signature);
  if (!isValid) {
    logger.warn("[Webhook] Signature verification FAILED — possible spoofed request.");
    return res.status(400).json({ success: false, message: "Invalid signature." });
  }

  try {
    req.body = JSON.parse(req.body.toString("utf8"));
  } catch (err) {
    logger.error("[Webhook] Failed to parse verified webhook body as JSON", { error: err.message });
    return res.status(400).json({ success: false, message: "Malformed JSON." });
  }

  next();
};

module.exports = { razorpayWebhookAuth };
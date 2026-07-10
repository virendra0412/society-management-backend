const { sendContactFormEmail, sendDemoRequestEmail } = require("../utils/email");
const { sendSuccess, sendError } = require("../utils/response");
const logger = require("../utils/logger");

/**
 * POST /api/v1/public/contact
 *
 * Public, unauthenticated endpoint used by the marketing website's
 * "Contact Us" form. Sends an email to BUSINESS_CONTACT_EMAIL via the same
 * SMTP setup the mobile app already relies on — no separate email vendor
 * for the website.
 *
 * Never leaks SMTP/internal errors to the caller — always a generic
 * "try again" message, with the real error logged server-side.
 */
const contactUs = async (req, res) => {
  const { name, email, phone, society, units, message, type } = req.body;

  try {
    await sendContactFormEmail({ name, email, phone, society, units, message, type });
  } catch (err) {
    logger.error("[public.controller] contactUs — failed to send", { message: err.message });
    return sendError(res, {
      statusCode: 502,
      status: "fail",
      code: "EMAIL_SEND_FAILED",
      message: "Couldn't send your message right now. Please try again shortly or email us directly.",
    });
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: "Thanks — we've received your message and will get back to you soon.",
  });
};

/**
 * POST /api/v1/public/demo
 *
 * Public, unauthenticated endpoint used by the marketing website's
 * "Request a Demo" form. Same delivery path as contactUs — same SMTP
 * setup, same BUSINESS_CONTACT_EMAIL inbox — just its own email copy
 * tailored to demo bookings (preferred slot, 2-hour SLA note).
 */
const demoRequest = async (req, res) => {
  const { name, email, phone, society, units, preferredSlot, notes } = req.body;

  try {
    await sendDemoRequestEmail({ name, email, phone, society, units, preferredSlot, notes });
  } catch (err) {
    logger.error("[public.controller] demoRequest — failed to send", { message: err.message });
    return sendError(res, {
      statusCode: 502,
      status: "fail",
      code: "EMAIL_SEND_FAILED",
      message: "Couldn't book your demo right now. Please try again shortly or email us directly.",
    });
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: "Demo request received — we'll confirm your slot within 2 hours.",
  });
};

module.exports = { contactUs, demoRequest };
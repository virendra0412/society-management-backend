const nodemailer = require("nodemailer");
const AppError = require("./AppError");

const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"];

const isConfigured = () => required.every((key) => !!process.env[key]);

const createTransporter = () => nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendPasswordResetOTP = async ({ to, otp }) => {
  if (!isConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw AppError.internal("Password reset email is not configured.");
    }
    console.log(`[DEV] Password reset OTP for ${to}: ${otp}`);
    return;
  }

  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "Your Society App password reset OTP",
    text: `Your password reset OTP is ${otp}. It expires in 10 minutes.`,
    html: `<p>Your password reset OTP is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`,
  });
};

/**
 * Sent once a superadmin approves a society registration application.
 * Delivers the admin's login email + temporary password so the secretary/owner
 * can log in independently — no manual relay of credentials by the superadmin.
 *
 * NOTE: This is the only notification in the approval flow. If SMTP isn't
 * configured, we log to console in dev so local testing still works, but we
 * throw in production since there would be no other way for the admin to
 * receive their credentials.
 */
const sendSocietyApprovedEmail = async ({ to, adminName, societyName, tempPassword, loginUrl }) => {
  const url = loginUrl || process.env.APP_LOGIN_URL || "";

  if (!isConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw AppError.internal("Society approval email is not configured.");
    }
    console.log(
      `[DEV] Society "${societyName}" approved for ${to}. Temp password: ${tempPassword}`
    );
    return;
  }

  const transporter = createTransporter();
  const loginLine = url ? `<p>Log in here: <a href="${url}">${url}</a></p>` : "";
  const loginLineText = url ? `Log in here: ${url}\n` : "";

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `Your society "${societyName}" has been approved`,
    text:
      `Hi ${adminName},\n\n` +
      `Good news — your application for "${societyName}" has been approved.\n\n` +
      `Your login email: ${to}\n` +
      `Your temporary password: ${tempPassword}\n\n` +
      `${loginLineText}` +
      `You'll be asked to set a new password the first time you log in.\n\n` +
      `Welcome aboard!`,
    html:
      `<p>Hi ${adminName},</p>` +
      `<p>Good news — your application for <strong>${societyName}</strong> has been approved.</p>` +
      `<p>Your login email: <strong>${to}</strong><br/>` +
      `Your temporary password: <strong>${tempPassword}</strong></p>` +
      loginLine +
      `<p>You'll be asked to set a new password the first time you log in.</p>` +
      `<p>Welcome aboard!</p>`,
  });
};

/**
 * Sent when a superadmin rejects a society registration application.
 * Not fatal if it fails to send — rejection already happened in the DB —
 * so callers should log-and-continue rather than fail the request.
 */
const sendApplicationRejectedEmail = async ({ to, adminName, societyName, note }) => {
  if (!isConfigured()) {
    console.log(
      `[DEV] Application for "${societyName}" rejected for ${to}. Note: ${note || "(none)"}`
    );
    return;
  }

  const transporter = createTransporter();
  const noteLine = note ? `\n\nReason: ${note}` : "";
  const noteLineHtml = note ? `<p>Reason: ${note}</p>` : "";

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `Update on your application for "${societyName}"`,
    text:
      `Hi ${adminName},\n\n` +
      `Your application for "${societyName}" was not approved at this time.${noteLine}\n\n` +
      `If you believe this is a mistake or would like to reapply with corrected details, please get in touch with us.`,
    html:
      `<p>Hi ${adminName},</p>` +
      `<p>Your application for <strong>${societyName}</strong> was not approved at this time.</p>` +
      noteLineHtml +
      `<p>If you believe this is a mistake or would like to reapply with corrected details, please get in touch with us.</p>`,
  });
};

module.exports = {
  sendPasswordResetOTP,
  sendSocietyApprovedEmail,
  sendApplicationRejectedEmail,
};
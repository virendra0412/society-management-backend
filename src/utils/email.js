const nodemailer = require("nodemailer");
const AppError = require("./AppError");
const logger = require("./logger");

const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"];

const isConfigured = () => required.every((key) => !!process.env[key]);

// Logs which required SMTP vars are missing, without ever printing secrets.
const logConfigStatus = () => {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    logger.warn("[Email] SMTP not fully configured — missing env var(s)", { missing });
  } else {
    logger.info("[Email] SMTP config present", {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE,
      user: _maskEmail(process.env.SMTP_USER),
      from: _maskEmail(process.env.EMAIL_FROM),
    });
  }
};

// e.g. "secretary@example.com" -> "se***@example.com" — enough to verify
// it's the right account without dumping a real address into log files.
const _maskEmail = (email) => {
  if (!email || !email.includes("@")) return email;
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
};

// ─── Branded HTML email layout ─────────────────────────────────────────────
// Table-based layout (not flexbox/grid) on purpose — this is the one part of
// the codebase that has to render correctly in Gmail/Outlook/Apple Mail,
// which only reliably support old-school table layouts + inline styles.
// Colors match the mobile app's theme (C.navy / C.teal in constants/theme.js)
// so the email feels like part of the same product, not a generic system mail.
const BRAND = {
  name: process.env.EMAIL_APP_NAME || "Society App",
  logoUrl: process.env.EMAIL_LOGO_URL || "", // optional hosted logo image
  navy: "#0F2040",
  teal: "#0D7377",
  bg: "#F4F6F8",
  textMuted: "#6B7280",
};

const _emailLayout = ({ preheader = "", heading, bodyHtml, ctaLabel, ctaUrl }) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${BRAND.name}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${BRAND.bg}; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <!-- Preheader: hidden preview text shown next to subject line in inbox lists -->
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${preheader}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.bg}; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);">

            <!-- Header / logo band -->
            <tr>
              <td style="background-color:${BRAND.navy}; padding:28px 32px;" align="center">
                ${
                  BRAND.logoUrl
                    ? `<img src="${BRAND.logoUrl}" alt="${BRAND.name}" height="32" style="display:block;" />`
                    : `<span style="font-size:20px; font-weight:700; color:#ffffff; letter-spacing:0.3px;">🏠 ${BRAND.name}</span>`
                }
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px; font-size:20px; line-height:1.3; color:${BRAND.navy}; font-weight:700;">${heading}</h1>
                <div style="font-size:14px; line-height:1.7; color:#374151;">
                  ${bodyHtml}
                </div>
                ${
                  ctaUrl
                    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                        <tr>
                          <td style="border-radius:8px; background-color:${BRAND.teal};">
                            <a href="${ctaUrl}" target="_blank" style="display:inline-block; padding:12px 24px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">${ctaLabel || "Open " + BRAND.name}</a>
                          </td>
                        </tr>
                      </table>`
                    : ""
                }
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:20px 32px; background-color:#FAFAFA; border-top:1px solid #EEF0F2;">
                <p style="margin:0; font-size:12px; color:${BRAND.textMuted}; line-height:1.6;">
                  This is an automated message from ${BRAND.name}. If you weren't expecting this email, you can safely ignore it.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

// Small reusable building block for "key: value" rows (credentials, etc.)
// inside an email body — keeps things like passwords visually distinct
// without relying on <table> nesting at every call site.
const _credentialBox = (rows) => `
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0; background-color:#F4F6F8; border-radius:8px; border:1px solid #E5E7EB;">
    ${rows.map(([label, value], i) => `
      <tr>
        <td style="padding:12px 16px; ${i < rows.length - 1 ? "border-bottom:1px solid #E5E7EB;" : ""}">
          <span style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.4px; color:${BRAND.textMuted};">${label}</span>
          <span style="display:block; font-size:15px; font-weight:700; color:${BRAND.navy}; margin-top:2px; font-family:'SFMono-Regular',Consolas,monospace;">${value}</span>
        </td>
      </tr>`).join("")}
  </table>
`;

const createTransporter = () => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    debug: process.env.NODE_ENV !== "production",
  });

  if (process.env.NODE_ENV !== "production") {
    transporter.on("error", (err) => {
      console.log("[Email][LOCAL] transporter error", err && err.message ? err.message : err);
    });
    transporter.on("idle", () => {
      console.log("[Email][LOCAL] transporter idle");
    });
  }

  return transporter;
};

const _verifySmtpConnection = async (transporter) => {
  // if (process.env.NODE_ENV === "production") return;

  try {
    console.log("[Email][LOCAL] Verifying SMTP connection to", process.env.SMTP_HOST, process.env.SMTP_PORT);
    const success = await transporter.verify();
    console.log("[Email][LOCAL] SMTP connection verified", success);
  } catch (err) {
    console.log("[Email][LOCAL] SMTP verification failed", {
      message: err.message,
      code: err.code,
      responseCode: err.responseCode,
      response: err.response,
      command: err.command,
    });
    throw err;
  }
};

const _maskRecipients = (value) => {
  if (!value) return value;
  if (Array.isArray(value)) return value.map(_maskEmail);
  return _maskEmail(value);
};

const _sendMailWithLocalDebug = async (label, transporter, mailOptions) => {
  const sanitizedMailOptions = {
    ...mailOptions,
    from: _maskEmail(mailOptions.from),
    to: _maskRecipients(mailOptions.to),
    replyTo: _maskRecipients(mailOptions.replyTo),
    cc: _maskRecipients(mailOptions.cc),
    bcc: _maskRecipients(mailOptions.bcc),
  };

  _localDebug(`${label} — verifying SMTP`, {
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpSecure: process.env.SMTP_SECURE === "true",
  });
  await _verifySmtpConnection(transporter);

  _localDebug(`${label} — sending`, sanitizedMailOptions);
  try {
    const info = await transporter.sendMail(mailOptions);
    _localDebug(`${label} — sent`, {
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected,
      pending: info.pending,
    });
    return info;
  } catch (err) {
    _localDebug(`${label} — failed`, {
      message: err.message,
      code: err.code,
      responseCode: err.responseCode,
      response: err.response,
      command: err.command,
      responseHeaders: err.responseHeaders,
    });
    throw err;
  }
};

// Pulls out the fields nodemailer/SMTP errors actually carry useful info in.
// A plain err.message is often just "Invalid login" with no context — the
// underlying SMTP response (responseCode, response, command) tells you
// whether it's bad credentials, an unverified sender, rate limiting, etc.
const _logSendFailure = (label, err) => {
  logger.error(`[Email] ${label} — send failed`, {
    message: err.message,
    code: err.code,
    responseCode: err.responseCode,
    response: err.response,
    command: err.command,
  });
};

const _localDebug = (...args) => {
  if (process.env.NODE_ENV !== "production") {
    console.log("[Email][LOCAL]", ...args);
  }
};

const sendPasswordResetOTP = async ({ to, otp }) => {
  logger.info("[Email] sendPasswordResetOTP called", { to: _maskEmail(to) });
  logConfigStatus();

  if (!isConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw AppError.internal("Password reset email is not configured.");
    }
    console.log(`[DEV] Password reset OTP for ${to}: ${otp}`);
    return;
  }

  const transporter = createTransporter();
  try {
    const info = await _sendMailWithLocalDebug("sendPasswordResetOTP", transporter, {
      from: process.env.EMAIL_FROM,
      to,
      subject: "Your Society App password reset OTP",
      text: `Your password reset OTP is ${otp}. It expires in 10 minutes.`,
      html: _emailLayout({
        preheader: `Your one-time password is ${otp}`,
        heading: "Reset your password",
        bodyHtml: `
          <p>Use the one-time password below to reset your password. It expires in <strong>10 minutes</strong>.</p>
          ${_credentialBox([["One-time password", otp]])}
          <p style="color:${BRAND.textMuted};">Didn't request this? You can safely ignore this email — your password won't change.</p>
        `,
      }),
    });
    logger.info("[Email] sendPasswordResetOTP — sent", { to: _maskEmail(to), messageId: info.messageId, response: info.response });
  } catch (err) {
    _logSendFailure("sendPasswordResetOTP", err);
    throw err;
  }
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

  logger.info("[Email] sendSocietyApprovedEmail called", { to: _maskEmail(to), societyName });
  logConfigStatus();

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
  const loginLineText = url ? `Log in here: ${url}\n` : "";

  try {
    const info = await _sendMailWithLocalDebug("sendSocietyApprovedEmail", transporter, {
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
      html: _emailLayout({
        preheader: `Your society "${societyName}" is approved — here's how to log in.`,
        heading: `You're approved, ${adminName} 🎉`,
        bodyHtml: `
          <p>Good news — your application for <strong>${societyName}</strong> has been approved.</p>
          <p>Use these credentials to log in for the first time:</p>
          ${_credentialBox([
            ["Login email", to],
            ["Temporary password", tempPassword],
          ])}
          <p style="color:${BRAND.textMuted};">You'll be asked to set your own password the first time you log in.</p>
        `,
        ctaLabel: url ? `Open ${BRAND.name}` : null,
        ctaUrl: url || null,
      }),
    });
    logger.info("[Email] sendSocietyApprovedEmail — sent", { to: _maskEmail(to), messageId: info.messageId, response: info.response });
  } catch (err) {
    _logSendFailure("sendSocietyApprovedEmail", err);
    throw err;
  }
};

/**
 * Sent when a superadmin rejects a society registration application.
 * Not fatal if it fails to send — rejection already happened in the DB —
 * so callers should log-and-continue rather than fail the request.
 */
const sendApplicationRejectedEmail = async ({ to, adminName, societyName, note }) => {
  logger.info("[Email] sendApplicationRejectedEmail called", { to: _maskEmail(to), societyName });
  logConfigStatus();

  if (!isConfigured()) {
    console.log(
      `[DEV] Application for "${societyName}" rejected for ${to}. Note: ${note || "(none)"}`
    );
    return;
  }

  const transporter = createTransporter();
  const noteLine = note ? `\n\nReason: ${note}` : "";

  try {
    const info = await _sendMailWithLocalDebug("sendApplicationRejectedEmail", transporter, {
      from: process.env.EMAIL_FROM,
      to,
      subject: `Update on your application for "${societyName}"`,
      text:
        `Hi ${adminName},\n\n` +
        `Your application for "${societyName}" was not approved at this time.${noteLine}\n\n` +
        `If you believe this is a mistake or would like to reapply with corrected details, please get in touch with us.`,
      html: _emailLayout({
        preheader: `Update on your application for "${societyName}"`,
        heading: "Application not approved",
        bodyHtml: `
          <p>Hi ${adminName},</p>
          <p>Your application for <strong>${societyName}</strong> was not approved at this time.</p>
          ${note ? `
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0; background-color:#FEF2F2; border-radius:8px; border:1px solid #FECACA;">
              <tr><td style="padding:12px 16px;">
                <span style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.4px; color:#B91C1C;">Reason</span>
                <span style="display:block; font-size:14px; color:#7F1D1D; margin-top:2px;">${note}</span>
              </td></tr>
            </table>` : ""}
          <p style="color:${BRAND.textMuted};">If you believe this is a mistake or would like to reapply with corrected details, please get in touch with us.</p>
        `,
      }),
    });
    logger.info("[Email] sendApplicationRejectedEmail — sent", { to: _maskEmail(to), messageId: info.messageId, response: info.response });
  } catch (err) {
    _logSendFailure("sendApplicationRejectedEmail", err);
    throw err;
  }
};

/**
 * Sent by the daily subscription-expiry cron job, warning a society admin
 * their plan is expiring soon. Best-effort — the job already tracks push
 * notifications separately, so a failed email here shouldn't break the cron run.
 */
const sendSubscriptionExpiryEmail = async ({ to, adminName, societyName, daysLeft, plan }) => {
  logger.info("[Email] sendSubscriptionExpiryEmail called", { to: _maskEmail(to), societyName, daysLeft });
  logConfigStatus();

  if (!isConfigured()) {
    console.log(
      `[DEV] Subscription expiry email for "${societyName}" (${to}) — ${daysLeft} day(s) left on ${plan} plan`
    );
    return;
  }

  const transporter = createTransporter();
  const dayWord = daysLeft === 1 ? "day" : "days";

  try {
    const info = await _sendMailWithLocalDebug("sendSubscriptionExpiryEmail", transporter, {
      from: process.env.EMAIL_FROM,
      to,
      subject: `Your ${plan} plan expires in ${daysLeft} ${dayWord}`,
      text:
        `Hi ${adminName},\n\n` +
        `Your ${plan} plan for "${societyName}" expires in ${daysLeft} ${dayWord}.\n\n` +
        `Renew soon to avoid any interruption to your society's account.`,
      html: _emailLayout({
        preheader: `Your ${plan} plan for "${societyName}" expires in ${daysLeft} ${dayWord}.`,
        heading: "Your plan is expiring soon",
        bodyHtml: `
          <p>Hi ${adminName},</p>
          <p>Your <strong>${plan}</strong> plan for <strong>${societyName}</strong> expires in:</p>
          ${_credentialBox([["Time remaining", `${daysLeft} ${dayWord}`]])}
          <p style="color:${BRAND.textMuted};">Renew soon to avoid any interruption to your society's account.</p>
        `,
        ctaLabel: process.env.APP_LOGIN_URL ? `Renew in ${BRAND.name}` : null,
        ctaUrl: process.env.APP_LOGIN_URL || null,
      }),
    });
    logger.info("[Email] sendSubscriptionExpiryEmail — sent", { to: _maskEmail(to), messageId: info.messageId, response: info.response });
  } catch (err) {
    _logSendFailure("sendSubscriptionExpiryEmail", err);
    // Don't rethrow — best-effort, the cron job continues for other societies.
  }
};

const CONTACT_TYPE_LABEL = {
  demo: "Book a product demo",
  pricing: "Pricing & plan query",
  support: "Technical support",
  partnership: "Partnership / reseller",
  press: "Press / media enquiry",
  other: "Other",
};

/**
 * Sent when someone submits the "Contact Us" form on the marketing website.
 * Notifies the business inbox (BUSINESS_CONTACT_EMAIL) with the lead's
 * details; replyTo is set to the submitter's own email so the team can hit
 * "reply" directly. This is the one email sender shared with the public
 * website — everything else in this file is only ever called from the
 * mobile app's backend flows.
 *
 * Not fatal if it fails to send — caller should surface a friendly error
 * to the website visitor rather than crash the request.
 */
const sendContactFormEmail = async ({ name, email, phone, society, units, message, type }) => {
  const to = process.env.BUSINESS_CONTACT_EMAIL || "virendachavda143@gmail.com";
  const typeLabel = CONTACT_TYPE_LABEL[type] || type || "General enquiry";

  logger.info("[Email] sendContactFormEmail called", { to: _maskEmail(to), type });
  logConfigStatus();

  if (!isConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw AppError.internal("Contact form email is not configured.");
    }
    console.log(`[DEV] Contact form submission (${typeLabel}) from ${name} <${email}>: ${message}`);
    return;
  }

  const transporter = createTransporter();
  const detailRows = [["Name", name], ["Email", email]];
  if (phone) detailRows.push(["Phone", phone]);
  if (society) detailRows.push(["Society", society]);
  if (units) detailRows.push(["Units", units]);
  detailRows.push(["Enquiry type", typeLabel]);

  try {
    const info = await _sendMailWithLocalDebug("sendContactFormEmail", transporter, {
      from: process.env.EMAIL_FROM,
      to,
      replyTo: email,
      subject: `[${typeLabel}] New website enquiry from ${name}${society ? ` — ${society}` : ""}`,
      text:
        `New contact form submission from the website.\n\n` +
        detailRows.map(([k, v]) => `${k}: ${v}`).join("\n") +
        `\n\nMessage:\n${message}`,
      html: _emailLayout({
        preheader: `New website enquiry from ${name}`,
        heading: "New website enquiry",
        bodyHtml: `
          ${_credentialBox(detailRows)}
          <p style="margin-top:16px;"><strong>Message</strong></p>
          <p style="white-space:pre-wrap;">${String(message).replace(/</g, "&lt;")}</p>
        `,
        ctaLabel: `Reply to ${name}`,
        ctaUrl: `mailto:${email}?subject=${encodeURIComponent("Re: Your SocietyApp enquiry")}`,
      }),
    });
    logger.info("[Email] sendContactFormEmail — sent", { to: _maskEmail(to), messageId: info.messageId, response: info.response });
  } catch (err) {
    _logSendFailure("sendContactFormEmail", err);
    throw err;
  }
};

/**
 * Sent when someone books a demo via the "Request a Demo" form on the
 * marketing website. Same delivery mechanism as sendContactFormEmail
 * (BUSINESS_CONTACT_EMAIL, same SMTP setup) but keeps its own tailored
 * copy — demo requests have a 2-hour response SLA and a preferred-slot
 * field that a generic enquiry doesn't.
 *
 * Not fatal if it fails to send — caller should surface a friendly error
 * to the website visitor rather than crash the request.
 */
const sendDemoRequestEmail = async ({ name, email, phone, society, units, preferredSlot, notes }) => {
  const to = process.env.BUSINESS_CONTACT_EMAIL || "virendachavda143@gmail.com";

  logger.info("[Email] sendDemoRequestEmail called", { to: _maskEmail(to) });
  logConfigStatus();

  if (!isConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw AppError.internal("Demo request email is not configured.");
    }
    console.log(`[DEV] Demo request from ${name} <${email}>${preferredSlot ? ` — preferred slot: ${preferredSlot}` : ""}`);
    return;
  }

  const transporter = createTransporter();
  const detailRows = [["Name", name], ["Email", email]];
  if (phone) detailRows.push(["Phone", phone]);
  if (society) detailRows.push(["Society", society]);
  if (units) detailRows.push(["Units", units]);
  if (preferredSlot) detailRows.push(["Preferred slot", preferredSlot]);

  try {
    const info = await _sendMailWithLocalDebug("sendDemoRequestEmail", transporter, {
      from: process.env.EMAIL_FROM,
      to,
      replyTo: email,
      subject: `Demo request from ${name}${society ? ` — ${society}` : ""}${preferredSlot ? ` [${preferredSlot}]` : ""}`,
      text:
        `New demo request from the website. Confirm the slot and send a calendar invite within 2 hours.\n\n` +
        detailRows.map(([k, v]) => `${k}: ${v}`).join("\n") +
        (notes ? `\n\nNotes:\n${notes}` : ""),
      html: _emailLayout({
        preheader: `New demo request from ${name}`,
        heading: "New demo request",
        bodyHtml: `
          <p style="color:#92400E; background:#FEF3C7; border-radius:8px; padding:10px 14px; font-weight:600; font-size:13px;">
            Action required — confirm this slot and send a calendar invite within 2 hours.
          </p>
          ${_credentialBox(detailRows)}
          ${notes ? `<p style="margin-top:16px;"><strong>Notes</strong></p><p style="white-space:pre-wrap;">${String(notes).replace(/</g, "&lt;")}</p>` : ""}
        `,
        ctaLabel: `Reply to ${name}`,
        ctaUrl: `mailto:${email}?subject=${encodeURIComponent("Your SocietyApp demo")}`,
      }),
    });
    logger.info("[Email] sendDemoRequestEmail — sent", { to: _maskEmail(to), messageId: info.messageId, response: info.response });
  } catch (err) {
    _logSendFailure("sendDemoRequestEmail", err);
    throw err;
  }
};

module.exports = {
  sendPasswordResetOTP,
  sendSocietyApprovedEmail,
  sendApplicationRejectedEmail,
  sendSubscriptionExpiryEmail,
  sendContactFormEmail,
  sendDemoRequestEmail,
};
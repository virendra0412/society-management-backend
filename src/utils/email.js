/**
 * utils/email.js
 *
 * All transactional emails sent by the backend.
 *
 * Transport: Brevo HTTP API (not SMTP).
 * Using the HTTP API instead of Brevo's SMTP relay means:
 *   - No outbound port 587/465 needed — works on Render free tier.
 *   - No connection timeouts — each send is a single HTTPS POST.
 *   - No nodemailer dependency.
 *
 * Required env vars (set once on Render, never touch again):
 *   BREVO_API_KEY     your Brevo API key (Brevo → SMTP & API → API Keys)
 *   EMAIL_FROM        the verified sender address, e.g. noreply@yourdomain.com
 *
 * Optional env vars:
 *   EMAIL_APP_NAME    display name in email headers   (default: "Society App")
 *   EMAIL_LOGO_URL    hosted logo image URL            (default: emoji fallback)
 *   APP_LOGIN_URL     deep-link / web URL for CTA buttons
 *   BUSINESS_CONTACT_EMAIL  inbox for contact-form + demo-request emails
 *
 * Functions exported (signatures unchanged from nodemailer version):
 *   sendPasswordResetOTP
 *   sendSocietyApprovedEmail
 *   sendApplicationRejectedEmail
 *   sendSubscriptionExpiryEmail
 *   sendContactFormEmail
 *   sendDemoRequestEmail
 */

const https   = require("https");
const AppError = require("./AppError");
const logger   = require("./logger");

// ─── Config check ──────────────────────────────────────────────────────────────

const required    = ["BREVO_API_KEY", "EMAIL_FROM"];
const isConfigured = () => required.every((key) => !!process.env[key]);

const _maskEmail = (email) => {
  if (!email || !email.includes("@")) return email;
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
};

const logConfigStatus = () => {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    logger.warn("[Email] Brevo API not fully configured — missing env var(s)", { missing });
  } else {
    logger.info("[Email] Brevo API config present", {
      from: _maskEmail(process.env.EMAIL_FROM),
      apiKey: process.env.BREVO_API_KEY
        ? process.env.BREVO_API_KEY.slice(0, 8) + "..."
        : "(missing)",
    });
  }
};

// ─── Brevo HTTP API sender ─────────────────────────────────────────────────────
// Single function that replaces createTransporter() + sendMail() from the old
// nodemailer version. One HTTPS POST per send — no connection management needed.

const _sendViaBrevoApi = async (label, { to, subject, html, text, replyTo }) => {
  const apiKey = process.env.BREVO_API_KEY;
  const fromRaw = process.env.EMAIL_FROM || "";
  const fromMatch = fromRaw.match(/^(.+)<(.+)>$/);

  const payload = {
    sender: fromMatch
      ? { name: fromMatch[1].trim(), email: fromMatch[2].trim() }
      : { email: fromRaw.trim() },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text,
    ...(replyTo ? { replyTo: { email: replyTo } } : {}),
  };

  logger.info(`[Email] ${label} — sending via Brevo API`, {
    to: _maskEmail(to),
    subject,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.brevo.com",
        path: "/v3/smtp/email",
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "api-key": apiKey,
        },
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          let parsedBody = {};
          try {
            parsedBody = responseBody ? JSON.parse(responseBody) : {};
          } catch (parseErr) {
            return reject(parseErr);
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            logger.info(`[Email] ${label} — sent`, {
              to: _maskEmail(to),
              messageId: parsedBody?.messageId,
            });
            resolve(parsedBody);
            return;
          }

          const err = new Error(`Brevo API request failed with ${res.statusCode}`);
          err.status = res.statusCode;
          err.body = parsedBody;
          logger.error(`[Email] ${label} — send failed`, {
            status: err.status,
            message: err.message,
            body: err.body,
          });
          reject(err);
        });
      }
    );

    req.on("error", (err) => {
      logger.error(`[Email] ${label} — send failed`, {
        status: err.status || 0,
        message: err.message,
      });
      reject(err);
    });

    req.write(JSON.stringify(payload));
    req.end();
  });
};

// ─── Branded HTML email layout ─────────────────────────────────────────────────
// Table-based layout (not flexbox/grid) on purpose — this is the one part of
// the codebase that has to render correctly in Gmail/Outlook/Apple Mail,
// which only reliably support old-school table layouts + inline styles.

const BRAND = {
  name:      process.env.EMAIL_APP_NAME || "Society App",
  logoUrl:   process.env.EMAIL_LOGO_URL || "",
  navy:      "#0F2040",
  teal:      "#0D7377",
  bg:        "#F4F6F8",
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
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${preheader}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.bg}; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);">

            <tr>
              <td style="background-color:${BRAND.navy}; padding:28px 32px;" align="center">
                ${BRAND.logoUrl
                  ? `<img src="${BRAND.logoUrl}" alt="${BRAND.name}" height="32" style="display:block;" />`
                  : `<span style="font-size:20px; font-weight:700; color:#ffffff; letter-spacing:0.3px;">🏠 ${BRAND.name}</span>`
                }
              </td>
            </tr>

            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px; font-size:20px; line-height:1.3; color:${BRAND.navy}; font-weight:700;">${heading}</h1>
                <div style="font-size:14px; line-height:1.7; color:#374151;">
                  ${bodyHtml}
                </div>
                ${ctaUrl ? `
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                    <tr>
                      <td style="border-radius:8px; background-color:${BRAND.teal};">
                        <a href="${ctaUrl}" target="_blank" style="display:inline-block; padding:12px 24px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">${ctaLabel || "Open " + BRAND.name}</a>
                      </td>
                    </tr>
                  </table>` : ""}
              </td>
            </tr>

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

// ─── Email functions ────────────────────────────────────────────────────────────
// Each function is identical to the nodemailer version in behaviour and
// signature. Only the internal send call changed (_sendViaBrevoApi vs sendMail).

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

  await _sendViaBrevoApi("sendPasswordResetOTP", {
    to,
    subject: "Your Society App password reset OTP",
    text: `Your password reset OTP is ${otp}. It expires in 10 minutes.`,
    html: _emailLayout({
      preheader: `Your one-time password is ${otp}`,
      heading:   "Reset your password",
      bodyHtml:  `
        <p>Use the one-time password below to reset your password. It expires in <strong>10 minutes</strong>.</p>
        ${_credentialBox([["One-time password", otp]])}
        <p style="color:${BRAND.textMuted};">Didn't request this? You can safely ignore this email — your password won't change.</p>
      `,
    }),
  });
};

const sendSocietyApprovedEmail = async ({ to, adminName, societyName, tempPassword, loginUrl }) => {
  const url = loginUrl || process.env.APP_LOGIN_URL || "";

  logger.info("[Email] sendSocietyApprovedEmail called", { to: _maskEmail(to), societyName });
  logConfigStatus();

  if (!isConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw AppError.internal("Society approval email is not configured.");
    }
    console.log(`[DEV] Society "${societyName}" approved for ${to}. Temp password: ${tempPassword}`);
    return;
  }

  await _sendViaBrevoApi("sendSocietyApprovedEmail", {
    to,
    subject: `Your society "${societyName}" has been approved`,
    text:
      `Hi ${adminName},\n\n` +
      `Good news — your application for "${societyName}" has been approved.\n\n` +
      `Your login email: ${to}\n` +
      `Your temporary password: ${tempPassword}\n\n` +
      (url ? `Log in here: ${url}\n\n` : "") +
      `You'll be asked to set a new password the first time you log in.\n\nWelcome aboard!`,
    html: _emailLayout({
      preheader: `Your society "${societyName}" is approved — here's how to log in.`,
      heading:   `You're approved, ${adminName} 🎉`,
      bodyHtml:  `
        <p>Good news — your application for <strong>${societyName}</strong> has been approved.</p>
        <p>Use these credentials to log in for the first time:</p>
        ${_credentialBox([
          ["Login email", to],
          ["Temporary password", tempPassword],
        ])}
        <p style="color:${BRAND.textMuted};">You'll be asked to set your own password the first time you log in.</p>
      `,
      ctaLabel: url ? `Open ${BRAND.name}` : null,
      ctaUrl:   url || null,
    }),
  });
};

const sendApplicationRejectedEmail = async ({ to, adminName, societyName, note }) => {
  logger.info("[Email] sendApplicationRejectedEmail called", { to: _maskEmail(to), societyName });
  logConfigStatus();

  if (!isConfigured()) {
    console.log(`[DEV] Application for "${societyName}" rejected for ${to}. Note: ${note || "(none)"}`);
    return;
  }

  await _sendViaBrevoApi("sendApplicationRejectedEmail", {
    to,
    subject: `Update on your application for "${societyName}"`,
    text:
      `Hi ${adminName},\n\n` +
      `Your application for "${societyName}" was not approved at this time.` +
      (note ? `\n\nReason: ${note}` : "") +
      `\n\nIf you believe this is a mistake, please get in touch with us.`,
    html: _emailLayout({
      preheader: `Update on your application for "${societyName}"`,
      heading:   "Application not approved",
      bodyHtml:  `
        <p>Hi ${adminName},</p>
        <p>Your application for <strong>${societyName}</strong> was not approved at this time.</p>
        ${note ? `
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0; background-color:#FEF2F2; border-radius:8px; border:1px solid #FECACA;">
            <tr><td style="padding:12px 16px;">
              <span style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.4px; color:#B91C1C;">Reason</span>
              <span style="display:block; font-size:14px; color:#7F1D1D; margin-top:2px;">${note}</span>
            </td></tr>
          </table>` : ""}
        <p style="color:${BRAND.textMuted};">If you believe this is a mistake or would like to reapply, please get in touch with us.</p>
      `,
    }),
  });
};

const sendSubscriptionExpiryEmail = async ({ to, adminName, societyName, daysLeft, plan }) => {
  logger.info("[Email] sendSubscriptionExpiryEmail called", { to: _maskEmail(to), societyName, daysLeft });
  logConfigStatus();

  if (!isConfigured()) {
    console.log(`[DEV] Subscription expiry for "${societyName}" (${to}) — ${daysLeft} day(s) left on ${plan}`);
    return;
  }

  const dayWord = daysLeft === 1 ? "day" : "days";

  await _sendViaBrevoApi("sendSubscriptionExpiryEmail", {
    to,
    subject: `Your ${plan} plan expires in ${daysLeft} ${dayWord}`,
    text:
      `Hi ${adminName},\n\n` +
      `Your ${plan} plan for "${societyName}" expires in ${daysLeft} ${dayWord}.\n\n` +
      `Renew soon to avoid any interruption to your society's account.`,
    html: _emailLayout({
      preheader: `Your ${plan} plan for "${societyName}" expires in ${daysLeft} ${dayWord}.`,
      heading:   "Your plan is expiring soon",
      bodyHtml:  `
        <p>Hi ${adminName},</p>
        <p>Your <strong>${plan}</strong> plan for <strong>${societyName}</strong> expires in:</p>
        ${_credentialBox([["Time remaining", `${daysLeft} ${dayWord}`]])}
        <p style="color:${BRAND.textMuted};">Renew soon to avoid any interruption to your society's account.</p>
      `,
      ctaLabel: process.env.APP_LOGIN_URL ? `Renew in ${BRAND.name}` : null,
      ctaUrl:   process.env.APP_LOGIN_URL || null,
    }),
  });
  // Best-effort — do not rethrow. Cron continues for other societies.
};

const CONTACT_TYPE_LABEL = {
  demo:        "Book a product demo",
  pricing:     "Pricing & plan query",
  support:     "Technical support",
  partnership: "Partnership / reseller",
  press:       "Press / media enquiry",
  other:       "Other",
};

const sendContactFormEmail = async ({ name, email, phone, society, units, message, type }) => {
  const to        = process.env.BUSINESS_CONTACT_EMAIL || "virendachavda143@gmail.com";
  const typeLabel = CONTACT_TYPE_LABEL[type] || type || "General enquiry";

  logger.info("[Email] sendContactFormEmail called", { to: _maskEmail(to), type });
  logConfigStatus();

  if (!isConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw AppError.internal("Contact form email is not configured.");
    }
    console.log(`[DEV] Contact form (${typeLabel}) from ${name} <${email}>: ${message}`);
    return;
  }

  const detailRows = [["Name", name], ["Email", email]];
  if (phone)   detailRows.push(["Phone", phone]);
  if (society) detailRows.push(["Society", society]);
  if (units)   detailRows.push(["Units", units]);
  detailRows.push(["Enquiry type", typeLabel]);

  await _sendViaBrevoApi("sendContactFormEmail", {
    to,
    replyTo: email,
    subject: `[${typeLabel}] New website enquiry from ${name}${society ? ` — ${society}` : ""}`,
    text:
      `New contact form submission.\n\n` +
      detailRows.map(([k, v]) => `${k}: ${v}`).join("\n") +
      `\n\nMessage:\n${message}`,
    html: _emailLayout({
      preheader: `New website enquiry from ${name}`,
      heading:   "New website enquiry",
      bodyHtml:  `
        ${_credentialBox(detailRows)}
        <p style="margin-top:16px;"><strong>Message</strong></p>
        <p style="white-space:pre-wrap;">${String(message).replace(/</g, "&lt;")}</p>
      `,
      ctaLabel: `Reply to ${name}`,
      ctaUrl:   `mailto:${email}?subject=${encodeURIComponent("Re: Your SocietyApp enquiry")}`,
    }),
  });
};

const sendDemoRequestEmail = async ({ name, email, phone, society, units, preferredSlot, notes }) => {
  const to = process.env.BUSINESS_CONTACT_EMAIL || "virendachavda143@gmail.com";

  logger.info("[Email] sendDemoRequestEmail called", { to: _maskEmail(to) });
  logConfigStatus();

  if (!isConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw AppError.internal("Demo request email is not configured.");
    }
    console.log(`[DEV] Demo request from ${name} <${email}>${preferredSlot ? ` — slot: ${preferredSlot}` : ""}`);
    return;
  }

  const detailRows = [["Name", name], ["Email", email]];
  if (phone)         detailRows.push(["Phone", phone]);
  if (society)       detailRows.push(["Society", society]);
  if (units)         detailRows.push(["Units", units]);
  if (preferredSlot) detailRows.push(["Preferred slot", preferredSlot]);

  await _sendViaBrevoApi("sendDemoRequestEmail", {
    to,
    replyTo: email,
    subject: `Demo request from ${name}${society ? ` — ${society}` : ""}${preferredSlot ? ` [${preferredSlot}]` : ""}`,
    text:
      `New demo request. Confirm slot and send calendar invite within 2 hours.\n\n` +
      detailRows.map(([k, v]) => `${k}: ${v}`).join("\n") +
      (notes ? `\n\nNotes:\n${notes}` : ""),
    html: _emailLayout({
      preheader: `New demo request from ${name}`,
      heading:   "New demo request",
      bodyHtml:  `
        <p style="color:#92400E; background:#FEF3C7; border-radius:8px; padding:10px 14px; font-weight:600; font-size:13px;">
          Action required — confirm this slot and send a calendar invite within 2 hours.
        </p>
        ${_credentialBox(detailRows)}
        ${notes ? `<p style="margin-top:16px;"><strong>Notes</strong></p><p style="white-space:pre-wrap;">${String(notes).replace(/</g, "&lt;")}</p>` : ""}
      `,
      ctaLabel: `Reply to ${name}`,
      ctaUrl:   `mailto:${email}?subject=${encodeURIComponent("Your SocietyApp demo")}`,
    }),
  });
};

module.exports = {
  sendPasswordResetOTP,
  sendSocietyApprovedEmail,
  sendApplicationRejectedEmail,
  sendSubscriptionExpiryEmail,
  sendContactFormEmail,
  sendDemoRequestEmail,
};
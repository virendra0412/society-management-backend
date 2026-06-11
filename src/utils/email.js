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

module.exports = { sendPasswordResetOTP };

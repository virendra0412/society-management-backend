const authService = require("../services/auth.service");
const { sendSuccess } = require("../utils/response");

class AuthController {
  async register(req, res) {
    const result = await authService.register(req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: result.pendingApproval
        ? "Registration successful. Your membership is pending admin approval."
        : "Registration successful.",
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        pendingApproval: result.pendingApproval,
      },
    });
  }

  async login(req, res) {
    const result = await authService.login(req.body);
    return sendSuccess(res, {
      message: "Login successful.",
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
    });
  }

  async refreshToken(req, res) {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshTokens(refreshToken);
    return sendSuccess(res, { message: "Tokens refreshed.", data: tokens });
  }

  async logout(req, res) {
    await authService.logout(req.user._id);
    return sendSuccess(res, { message: "Logged out successfully." });
  }

  async getMe(req, res) {
    return sendSuccess(res, { data: { user: req.user } });
  }

  // ── NEW: Step 1 — request OTP sent to email ────────────────────────────────
  async forgotPassword(req, res) {
    const result = await authService.forgotPassword(req.body.email);
    return sendSuccess(res, {
      message: result.message,
      ...(result.devOtp && { data: { devOtp: result.devOtp } }),
    });
  }

  // ── NEW: Step 2 — verify OTP and set new password ─────────────────────────
  async resetPassword(req, res) {
    const result = await authService.resetPassword(req.body);
    return sendSuccess(res, { message: result.message });
  }
}

module.exports = new AuthController();

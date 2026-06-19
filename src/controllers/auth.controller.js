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

  /**
   * POST /auth/switch-society
   * Validates membership, issues new JWT with new societyId context.
   */
  async switchSociety(req, res) {
    const { societyId } = req.body;
    const result = await authService.switchSociety(req.user._id, societyId);
    return sendSuccess(res, {
      message: "Society switched successfully.",
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
    });
  }

  /**
   * POST /auth/join-society
   * Add a second (or subsequent) society membership to an existing account.
   */
  async joinSociety(req, res) {
    const result = await authService.joinSociety(req.user._id, req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: result.pendingApproval
        ? "Join request submitted. Pending admin approval."
        : `Successfully joined ${result.society.name}.`,
      data: {
        user: result.user,
        society: result.society,
        pendingApproval: result.pendingApproval,
      },
    });
  }

  async forgotPassword(req, res) {
    const result = await authService.forgotPassword(req.body.email);
    return sendSuccess(res, {
      message: result.message,
      ...(result.devOtp && { data: { devOtp: result.devOtp } }),
    });
  }

  async resetPassword(req, res) {
    const result = await authService.resetPassword(req.body);
    return sendSuccess(res, { message: result.message });
  }

  async changePassword(req, res) {
    await authService.changePassword(req.user._id, req.body);
    return sendSuccess(res, { message: "Password changed successfully." });
  }

  // Unauthenticated — used the first time a user logs in with a temp password.
  async forceChangePassword(req, res) {
    const result = await authService.forceChangePassword(req.body);
    return sendSuccess(res, {
      message: "Password changed successfully. You're now logged in.",
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
    });
  }
}

module.exports = new AuthController();
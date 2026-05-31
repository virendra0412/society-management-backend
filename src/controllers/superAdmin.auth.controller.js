const superAdminService = require("../services/superAdmin.service");
const { sendSuccess }   = require("../utils/response");

class SuperAdminAuthController {
  async login(req, res) {
    const result = await superAdminService.login(req.body);
    return sendSuccess(res, {
      statusCode: 200,
      message:    "Login successful.",
      data:       result,
    });
  }

  async refreshToken(req, res) {
    const tokens = await superAdminService.refreshTokens(req.body.refreshToken);
    return sendSuccess(res, { data: tokens });
  }

  async logout(req, res) {
    await superAdminService.logout(req.superAdmin._id);
    return sendSuccess(res, { message: "Logged out." });
  }

  async me(req, res) {
    return sendSuccess(res, { data: { superAdmin: req.superAdmin } });
  }

  async changePassword(req, res) {
    const result = await superAdminService.changePassword(req.superAdmin._id, req.body);
    return sendSuccess(res, { message: result.message });
  }
}

module.exports = new SuperAdminAuthController();

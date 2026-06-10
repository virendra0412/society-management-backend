const superAdminService = require("../services/superAdmin.service");
const { sendSuccess }   = require("../utils/response");

class SuperAdminController {

  // ── Applications ─────────────────────────────────────────────────────────────

  /** Public: society applies for onboarding — no auth required */
  async applyForSociety(req, res) {
    const application = await superAdminService.applyForSociety(
      req.body,
      req.ip || req.socket?.remoteAddress
    );
    return sendSuccess(res, {
      statusCode: 201,
      message:    "Application submitted. You will be contacted once reviewed by our team.",
      data:       { application },
    });
  }

  async listApplications(req, res) {
    const { applications, meta } = await superAdminService.listApplications(req.query);
    return sendSuccess(res, { data: { applications }, meta });
  }

  async getApplication(req, res) {
    const application = await superAdminService.getApplication(req.params.id);
    return sendSuccess(res, { data: { application } });
  }

  async approveApplication(req, res) {
    const result = await superAdminService.approveApplication(
      req.params.id,
      req.body,
      req.superAdmin
    );
    return sendSuccess(res, {
      statusCode: 201,
      message:    result.message,
      data:       result,
    });
  }

  async rejectApplication(req, res) {
    const application = await superAdminService.rejectApplication(
      req.params.id,
      req.body,
      req.superAdmin
    );
    return sendSuccess(res, {
      message: "Application rejected.",
      data:    { application },
    });
  }

  // ── Societies ────────────────────────────────────────────────────────────────

  async listSocieties(req, res) {
    const { societies, meta } = await superAdminService.listSocieties(req.query);
    return sendSuccess(res, { data: { societies }, meta });
  }

  async getSociety(req, res) {
    const { society, subscription } = await superAdminService.getSocietyDetail(req.params.id);
    return sendSuccess(res, { data: { society, subscription } });
  }

  async updateSubscription(req, res) {
    const subscription = await superAdminService.updateSubscription(
      req.params.id,
      req.body,
      req.superAdmin
    );
    return sendSuccess(res, {
      message: "Subscription updated.",
      data:    { subscription },
    });
  }

  async suspendSociety(req, res) {
    const result = await superAdminService.suspendSociety(req.params.id, req.body, req.superAdmin);
    return sendSuccess(res, { message: result.message });
  }

  async reactivateSociety(req, res) {
    const result = await superAdminService.reactivateSociety(req.params.id, req.body, req.superAdmin);
    return sendSuccess(res, { message: result.message });
  }

  async transferAdmin(req, res) {
    const result = await superAdminService.transferAdmin(req.params.id, req.body, req.superAdmin);
    return sendSuccess(res, { message: result.message });
  }

  async resetAdminPassword(req, res) {
    const result = await superAdminService.resetAdminPassword(req.params.id, req.superAdmin);
    return sendSuccess(res, {
      message: result.message,
      data:    { adminEmail: result.adminEmail },
    });
  }

  // ── Analytics ────────────────────────────────────────────────────────────────

  async getGlobalAnalytics(req, res) {
    const analytics = await superAdminService.getGlobalAnalytics(req.query.period);
    return sendSuccess(res, { data: { analytics } });
  }

  async getSocietyAnalytics(req, res) {
    const result = await superAdminService.getSocietyAnalytics(req.params.id);
    return sendSuccess(res, { data: result });
  }

  // ── Module Management ─────────────────────────────────────────────────────────

  async getModules(req, res) {
    const data = await superAdminService.getModules(req.params.id);
    return sendSuccess(res, { data });
  }

  async updateModules(req, res) {
    const result = await superAdminService.updateModules(req.params.id, req.body, req.superAdmin);
    return sendSuccess(res, {
      message: "Modules updated successfully.",
      data:    result,
    });
  }

  async applyBundle(req, res) {
    const result = await superAdminService.applyBundle(req.params.id, req.body, req.superAdmin);
    return sendSuccess(res, {
      message: `Bundle '${result.bundle}' applied successfully.`,
      data:    result,
    });
  }

  async listUpgradeRequests(req, res) {
    const requests = await superAdminService.listUpgradeRequests();
    return sendSuccess(res, { data: { requests } });
  }
}

module.exports = new SuperAdminController();
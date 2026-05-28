const visitorService = require("../services/visitor.service");
const { sendSuccess } = require("../utils/response");

class VisitorController {
  // ── Resident: Create a pre-approved invite ────────────────────────────────
  async createInvite(req, res) {
    const { visitor, otp } = await visitorService.createInvite(req.body, req.user);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Visitor invite created. Share the OTP with your visitor — it won't be shown again.",
      data: { visitor, otp },
    });
  }

  // ── Resident: Cancel a pre-approved invite (GAP-5 FIX) ───────────────────
  /**
   * Allows the resident who created an invite to cancel it before the visitor
   * arrives. Invalidates the OTP and marks the record as expired so security
   * will not grant entry even if the visitor tries their old code.
   */
  async cancelInvite(req, res) {
    const visitor = await visitorService.cancelInvite(req.params.id, req.user);
    return sendSuccess(res, {
      message: "Invite cancelled. The visitor's OTP has been invalidated.",
      data: { visitor },
    });
  }

  // ── Security: Log a walk-in visitor ──────────────────────────────────────
  async logWalkIn(req, res) {
    const visitor = await visitorService.logWalkIn(req.body, req.user);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Walk-in visitor logged. Resident has been notified for approval.",
      data: { visitor },
    });
  }

  // ── Security: Verify OTP and grant entry ──────────────────────────────────
  async verifyOTP(req, res) {
    const visitor = await visitorService.verifyOTPAndGrantEntry(
      req.params.id,
      req.body.otp,
      req.user
    );
    return sendSuccess(res, {
      message: "OTP verified. Entry granted.",
      data: { visitor },
    });
  }

  // ── Resident: Approve a walk-in ───────────────────────────────────────────
  async approveWalkIn(req, res) {
    const visitor = await visitorService.approveWalkIn(req.params.id, req.user);
    return sendSuccess(res, {
      message: "Visitor entry approved.",
      data: { visitor },
    });
  }

  // ── Resident: Reject a walk-in ────────────────────────────────────────────
  async rejectWalkIn(req, res) {
    const visitor = await visitorService.rejectWalkIn(req.params.id, req.user);
    return sendSuccess(res, {
      message: "Visitor entry rejected.",
      data: { visitor },
    });
  }

  // ── Security: Mark visitor as exited ─────────────────────────────────────
  async markExit(req, res) {
    const visitor = await visitorService.markExit(req.params.id, req.user);
    return sendSuccess(res, {
      message: "Visitor exit recorded.",
      data: { visitor },
    });
  }

  // ── List: All visitors (admin/security) ──────────────────────────────────
  async getAll(req, res) {
    const { visitors, meta } = await visitorService.getAllVisitors(req.societyId, req.query);
    return sendSuccess(res, { data: { visitors }, meta });
  }

  // ── List: My visitors (resident) ─────────────────────────────────────────
  async getMyVisitors(req, res) {
    const { visitors, meta } = await visitorService.getMyVisitors(req.user, req.query);
    return sendSuccess(res, { data: { visitors }, meta });
  }

  // ── Get single visitor ────────────────────────────────────────────────────
  async getOne(req, res) {
    const visitor = await visitorService.getVisitorById(req.params.id, req.user);
    return sendSuccess(res, { data: { visitor } });
  }
}

module.exports = new VisitorController();

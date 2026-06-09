/**
 * controllers/visitor.controller.js
 *
 * CHANGED IN TASK 2:
 *   createInvite()        → "visitor.invite_created"
 *   cancelInvite()        → "visitor.invite_cancelled"
 *   logWalkIn()           → "visitor.walkin_logged"
 *   verifyOTP()           → "visitor.otp_verified"
 *   approveWalkIn()       → "visitor.walkin_approved"
 *   rejectWalkIn()        → "visitor.walkin_rejected"
 *   markExit()            → "visitor.exited"
 *   registerTrusted()     → "visitor.trusted_registered"
 *   revokeTrusted()       → "visitor.trusted_revoked"
 *
 * Read-only methods (getAll, getMyVisitors, getOne, getMyTrusted,
 * lookupTrusted, updateTrusted, trustedEntry) are UNCHANGED.
 */

const visitorService = require("../services/visitor.service");
const { sendSuccess } = require("../utils/response");
const { audit }       = require("../middlewares/audit.middleware"); // NEW

class VisitorController {
  // ── Resident: Create a pre-approved invite ────────────────────────────────
  async createInvite(req, res) {
    const { visitor, otp } = await visitorService.createInvite(req.body, req.user);

    await audit(req, "visitor.invite_created", "Visitor", visitor._id, {
      visitorName: visitor.name,
      purpose:     visitor.purpose,
    });

    return sendSuccess(res, {
      statusCode: 201,
      message: "Visitor invite created. Share the OTP with your visitor — it won't be shown again.",
      data: { visitor, otp },
    });
  }

  // ── Resident: Cancel a pre-approved invite ────────────────────────────────
  async cancelInvite(req, res) {
    const visitor = await visitorService.cancelInvite(req.params.id, req.user);

    await audit(req, "visitor.invite_cancelled", "Visitor", visitor._id, {
      cancelledBy: req.user._id,
    });

    return sendSuccess(res, {
      message: "Invite cancelled. The visitor's OTP has been invalidated.",
      data: { visitor },
    });
  }

  // ── Security: Log a walk-in visitor ──────────────────────────────────────
  async logWalkIn(req, res) {
    const visitor = await visitorService.logWalkIn(req.body, req.user);

    await audit(req, "visitor.walkin_logged", "Visitor", visitor._id, {
      visitorName: visitor.name,
      purpose:     visitor.purpose,
      loggedBy:    req.user._id,
    });

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

    await audit(req, "visitor.otp_verified", "Visitor", visitor._id, {
      verifiedBy: req.user._id,
    });

    return sendSuccess(res, {
      message: "OTP verified. Entry granted.",
      data: { visitor },
    });
  }

  // ── Resident: Approve a walk-in ───────────────────────────────────────────
  async approveWalkIn(req, res) {
    const visitor = await visitorService.approveWalkIn(req.params.id, req.user);

    await audit(req, "visitor.walkin_approved", "Visitor", visitor._id, {
      approvedBy: req.user._id,
    });

    return sendSuccess(res, {
      message: "Visitor entry approved.",
      data: { visitor },
    });
  }

  // ── Resident: Reject a walk-in ────────────────────────────────────────────
  async rejectWalkIn(req, res) {
    const visitor = await visitorService.rejectWalkIn(req.params.id, req.user);

    await audit(req, "visitor.walkin_rejected", "Visitor", visitor._id, {
      rejectedBy: req.user._id,
    });

    return sendSuccess(res, {
      message: "Visitor entry rejected.",
      data: { visitor },
    });
  }

  // ── Security: Mark visitor as exited ─────────────────────────────────────
  async markExit(req, res) {
    const visitor = await visitorService.markExit(req.params.id, req.user);

    await audit(req, "visitor.exited", "Visitor", visitor._id, {
      recordedBy: req.user._id,
    });

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

  // ── Resident: Register a trusted/frequent visitor ─────────────────────────
  async registerTrusted(req, res) {
    const visitor = await visitorService.registerTrustedVisitor(req.body, req.user);

    await audit(req, "visitor.trusted_registered", "Visitor", visitor._id, {
      trustedName: visitor.name,
      category:    visitor.trustedVisitor?.category,
    });

    return sendSuccess(res, {
      statusCode: 201,
      message: "Trusted visitor registered. They will be auto-approved within their schedule window.",
      data: { visitor },
    });
  }

  // ── Resident: Update a trusted visitor pass ───────────────────────────────
  async updateTrusted(req, res) {
    const visitor = await visitorService.updateTrustedVisitor(req.params.id, req.body, req.user);
    return sendSuccess(res, {
      message: "Trusted visitor pass updated.",
      data: { visitor },
    });
  }

  // ── Resident: Revoke a trusted visitor pass ───────────────────────────────
  async revokeTrusted(req, res) {
    const visitor = await visitorService.revokeTrustedVisitor(req.params.id, req.user);

    await audit(req, "visitor.trusted_revoked", "Visitor", visitor._id, {
      revokedBy: req.user._id,
    });

    return sendSuccess(res, {
      message: "Trusted visitor pass revoked. Entry will no longer be auto-approved.",
      data: { visitor },
    });
  }

  // ── Resident: List all trusted visitor passes ─────────────────────────────
  async getMyTrusted(req, res) {
    const activeOnly = req.query.activeOnly === "true";
    const visitors = await visitorService.getMyTrustedVisitors(req.user, { activeOnly });
    return sendSuccess(res, { data: { visitors } });
  }

  // ── Security: Look up a trusted visitor by phone / name ───────────────────
  async lookupTrusted(req, res) {
    const visitors = await visitorService.lookupTrustedVisitor(req.societyId, {
      phone: req.query.phone,
      name:  req.query.name,
    });
    return sendSuccess(res, { data: { visitors } });
  }

  // ── Security: Record auto-entry for a trusted visitor ────────────────────
  async trustedEntry(req, res) {
    const visitor = await visitorService.trustedVisitorEntry(req.params.id, req.user);
    return sendSuccess(res, {
      message: "Trusted visitor entry recorded.",
      data: { visitor },
    });
  }
}

module.exports = new VisitorController();
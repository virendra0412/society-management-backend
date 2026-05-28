const visitorRepository = require("../repositories/visitor.repository");
const AppError = require("../utils/AppError");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const { sendPushNotification } = require("../utils/notification");
const userRepository = require("../repositories/user.repository");

class VisitorService {
  _getSocietyId(user) {
    return user.society?._id || user.society;
  }

  // ─── Resident: Create Pre-Approved Invite ──────────────────────────────────

  /**
   * Resident invites a visitor in advance.
   * Generates an OTP for the visitor to show at the gate.
   * The plaintext OTP is returned ONCE in the response — never stored raw.
   */
  async createInvite(data, residentUser) {
    const societyId = this._getSocietyId(residentUser);

    // GAP-5 FIX: Validate expectedAt is in the future (at least 15 min from now)
    if (data.expectedAt) {
      const expectedDate = new Date(data.expectedAt);
      const minAllowed = new Date(Date.now() + 15 * 60 * 1000); // 15 min from now
      if (isNaN(expectedDate.getTime())) {
        throw AppError.badRequest("expectedAt must be a valid date.");
      }
      if (expectedDate < minAllowed) {
        throw AppError.badRequest(
          "Expected arrival must be at least 15 minutes in the future."
        );
      }
    }

    const visitor = new (require("../models/visitor.model"))({
      ...data,
      society: societyId,
      host: residentUser._id,
      hostFlat: residentUser.flat,
      status: "invited",
      isWalkIn: false,
    });

    // OTP valid for 24 hours by default; less if expectedAt is sooner
    let expiryMinutes = 1440; // 24 h
    if (data.expectedAt) {
      const hoursUntilVisit = (new Date(data.expectedAt) - Date.now()) / 1000 / 60;
      // OTP expires 2 hours after expected arrival, minimum 30 min from now
      expiryMinutes = Math.max(30, hoursUntilVisit + 120);
    }

    const plainOTP = visitor.generateOTP(expiryMinutes);
    await visitor.save();

    return { visitor, otp: plainOTP }; // OTP shown once to resident to forward to visitor
  }

  // ─── Resident: Cancel a Pre-Approved Invite ────────────────────────────────

  /**
   * GAP-5 FIX: Resident cancels their own pre-approved invite before the visitor arrives.
   * Only allowed when status is "invited" (visitor hasn't entered yet).
   * Sets status → "expired" and clears the OTP hash to invalidate the code.
   */
  async cancelInvite(visitorId, residentUser) {
    const visitor = await visitorRepository.findById(visitorId);
    if (!visitor) throw AppError.notFound("Visitor record not found.");

    // Must own this invite
    const hostId = visitor.host?._id?.toString() || visitor.host?.toString();
    if (hostId !== residentUser._id.toString()) {
      throw AppError.forbidden("You can only cancel your own invites.");
    }

    // Only cancellable when still in invited state
    if (visitor.status !== "invited") {
      throw AppError.badRequest(
        `Cannot cancel — invite is already '${visitor.status}'. ` +
        `Only active (invited) invites can be cancelled.`
      );
    }

    return visitorRepository.updateById(visitorId, {
      status: "expired",
      entryOTPHash: null,
      entryOTPExpires: null,
    });
  }

  // ─── Security: Log Walk-in Visitor ────────────────────────────────────────

  /**
   * Security guard logs a visitor who arrived without prior invite.
   * Sends a push notification to the resident requesting approval.
   */
  async logWalkIn(data, securityUser) {
    const societyId = this._getSocietyId(securityUser);

    // Verify host (resident) belongs to this society.
    // Use findByIdWithFcm so fcmToken (select:false) is included for the notification.
    const host = await userRepository.findByIdWithFcm(data.hostId);
    if (!host || host.society?.toString() !== societyId?.toString()) {
      throw AppError.notFound("Resident not found in this society.");
    }

    const visitor = await visitorRepository.create({
      ...data,
      host: data.hostId,
      hostFlat: host.flat,
      society: societyId,
      status: "pending",
      isWalkIn: true,
      loggedBy: securityUser._id,
    });

    // Notify resident
    if (host.fcmToken) {
      await sendPushNotification(
        [host.fcmToken],
        {
          title: "🚶 Visitor at Gate",
          body: `${visitor.name} (${visitor.purpose}) is at the gate. Please approve or reject.`,
        },
        { type: "visitor_walkin", visitorId: visitor._id.toString() }
      );
    }

    return visitor;
  }

  // ─── Security: Verify OTP and Grant Entry ─────────────────────────────────

  /**
   * Security guard enters the OTP given by the visitor.
   * If valid → marks entry and records entryTime.
   */
  async verifyOTPAndGrantEntry(visitorId, otp, securityUser) {
    const visitor = await visitorRepository.findByIdForOTP(visitorId);
    if (!visitor) throw AppError.notFound("Visitor record not found.");

    const societyId = this._getSocietyId(securityUser);
    if (visitor.society.toString() !== societyId?.toString()) {
      throw AppError.forbidden("Access denied.");
    }

    if (visitor.status === "approved" || visitor.status === "exited") {
      throw AppError.badRequest("Visitor has already entered or exited.");
    }
    if (visitor.status === "rejected") {
      throw AppError.badRequest("Entry has been rejected by the resident.");
    }
    if (visitor.status === "expired") {
      throw AppError.badRequest("This invite OTP has expired.");
    }

    if (!visitor.verifyOTP(otp)) {
      throw AppError.badRequest("Invalid or expired OTP.");
    }

    const updated = await visitorRepository.markEntry(visitorId, securityUser._id);

    // Notify resident that their guest has arrived.
    // Use findByIdWithFcm so fcmToken (select:false) is included.
    const host = await userRepository.findByIdWithFcm(visitor.host);
    if (host?.fcmToken) {
      await sendPushNotification(
        [host.fcmToken],
        {
          title: "✅ Visitor Entered",
          body: `${visitor.name} has entered the premises.`,
        },
        { type: "visitor_entry", visitorId: visitor._id.toString() }
      );
    }

    return updated;
  }

  // ─── Resident: Approve or Reject Walk-in ──────────────────────────────────

  async approveWalkIn(visitorId, residentUser) {
    const visitor = await visitorRepository.findById(visitorId);
    if (!visitor) throw AppError.notFound("Visitor record not found.");

    if (visitor.host._id.toString() !== residentUser._id.toString()) {
      throw AppError.forbidden("You can only approve visitors for your own flat.");
    }
    if (visitor.status !== "pending") {
      throw AppError.badRequest(`Cannot approve — current status is '${visitor.status}'.`);
    }

    const updated = await visitorRepository.markEntry(visitorId, residentUser._id);
    return updated;
  }

  async rejectWalkIn(visitorId, residentUser) {
    const visitor = await visitorRepository.findById(visitorId);
    if (!visitor) throw AppError.notFound("Visitor record not found.");

    if (visitor.host._id.toString() !== residentUser._id.toString()) {
      throw AppError.forbidden("You can only reject visitors for your own flat.");
    }
    if (visitor.status !== "pending") {
      throw AppError.badRequest(`Cannot reject — current status is '${visitor.status}'.`);
    }

    return visitorRepository.updateById(visitorId, { status: "rejected" });
  }

  // ─── Security: Mark Exit ───────────────────────────────────────────────────

  async markExit(visitorId, securityUser) {
    const visitor = await visitorRepository.findById(visitorId);
    if (!visitor) throw AppError.notFound("Visitor record not found.");

    const societyId = this._getSocietyId(securityUser);
    if (visitor.society.toString() !== societyId?.toString()) {
      throw AppError.forbidden("Access denied.");
    }
    if (visitor.status !== "approved") {
      throw AppError.badRequest("Only visitors currently inside can be marked as exited.");
    }

    return visitorRepository.markExit(visitorId);
  }

  // ─── Listing ───────────────────────────────────────────────────────────────

  /**
   * Admin / security: list all visitors for the society.
   */
  async getAllVisitors(societyId, query) {
    const { page, limit, skip } = parsePagination(query);
    const filters = {};
    if (query.status) filters.status = query.status;
    if (query.purpose) filters.purpose = query.purpose;
    if (query.hostFlat) filters.hostFlat = query.hostFlat;
    // Date range: e.g. ?from=2025-01-01&to=2025-01-31
    if (query.from || query.to) {
      filters.createdAt = {};
      if (query.from) filters.createdAt.$gte = new Date(query.from);
      if (query.to) filters.createdAt.$lte = new Date(query.to);
    }

    const { visitors, total } = await visitorRepository.findBySociety(
      societyId,
      filters,
      { skip, limit }
    );
    return { visitors, meta: buildPaginationMeta({ total, page, limit }) };
  }

  /**
   * Resident: list their own visitor history.
   */
  async getMyVisitors(residentUser, query) {
    const { page, limit, skip } = parsePagination(query);
    const filters = {};
    if (query.status) filters.status = query.status;

    const { visitors, total } = await visitorRepository.findByHost(
      residentUser._id,
      filters,
      { skip, limit }
    );
    return { visitors, meta: buildPaginationMeta({ total, page, limit }) };
  }

  async getVisitorById(visitorId, requestingUser) {
    const visitor = await visitorRepository.findById(visitorId);
    if (!visitor) throw AppError.notFound("Visitor not found.");

    const societyId = this._getSocietyId(requestingUser);
    if (visitor.society.toString() !== societyId?.toString()) {
      throw AppError.forbidden("Access denied.");
    }

    // Residents can only see their own visitors
    if (requestingUser.role === "resident") {
      if (visitor.host._id.toString() !== requestingUser._id.toString()) {
        throw AppError.forbidden("You can only view your own visitor records.");
      }
    }

    return visitor;
  }
}

module.exports = new VisitorService();

const visitorRepository = require("../repositories/visitor.repository");
const AppError = require("../utils/AppError");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const { sendPushNotification, notifyVisitorArrival } = require("../utils/notification");
const userRepository = require("../repositories/user.repository");

// ─── IST time helpers ──────────────────────────────────────────────────────
// FIX (reported bug #1): the server may run in any timezone (commonly UTC on
// cloud hosts), but residents enter accessSchedule.fromTime/toTime and pick
// passType="daily" expiry in IST (Indian Standard Time, UTC+5:30) — the only
// timezone this app's society data uses. Comparing `new Date().getHours()`
// or `new Date().setHours(...)` directly used the SERVER's local time, which
// silently broke every schedule-window and daily-expiry check whenever the
// server wasn't already running in IST. These helpers use the built-in
// Intl API (no extra dependency) to always compute the IST wall-clock time,
// regardless of what timezone the Node process itself is running in.
const IST_TZ = "Asia/Kolkata";

/** Returns { dayOfWeek (0=Sun..6=Sat), hhmm: "HH:MM" } for "now", in IST. */
function nowInIST() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const map = {};
  for (const p of parts) map[p.type] = p.value;

  const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // hour can come back as "24" for midnight with hour12:false in some ICU versions — normalize.
  const hour = map.hour === "24" ? "00" : map.hour;

  return {
    dayOfWeek: DAY_INDEX[map.weekday],
    hhmm: `${hour}:${map.minute}`,
  };
}

/** Returns a Date representing 23:59:59.999 *IST* today, expressed correctly in UTC. */
function endOfTodayIST() {
  const istNow = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // "YYYY-MM-DD" in IST
  // IST is UTC+5:30 with no DST — 23:59:59.999 IST == 18:29:59.999 UTC same date.
  return new Date(`${istNow}T18:29:59.999Z`);
}

class VisitorService {
  _getSocietyId(user) {
    return user.activeSocietyId?._id || user.activeSocietyId || user.society?._id || user.society;
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

    let host = null;
    let hostFlat = data.hostFlat || null;

    if (data.hostId) {
      // Verify host belongs to this society
      host = await userRepository.findByIdWithFcm(data.hostId);
      const membership = host?.getMembership?.(societyId);
      if (!host || !membership?.isApproved) {
        throw AppError.notFound("Resident not found in this society.");
      }
      hostFlat = membership.flat;
    } else if (data.hostFlat) {
      // Look up resident by flat number — convenient for security staff
      const User = require("../models/user.model");
      host = await User.findOne({
        memberships: {
          $elemMatch: {
            society: societyId,
            flat: data.hostFlat.trim(),
            isApproved: true,
            isActive: true,
          },
        },
        isActive: true,
      }).select("+fcmToken").lean();
      if (!host) {
        throw AppError.notFound(`No approved resident found for flat "${data.hostFlat}".`);
      }
      const membership = (host.memberships || []).find((m) => {
        const memberSocietyId = (m.society?._id || m.society)?.toString();
        return memberSocietyId === societyId?.toString() && m.isActive && m.isApproved;
      });
      hostFlat = membership?.flat || data.hostFlat.trim();
    }

    const visitor = await visitorRepository.create({
      ...data,
      host:     host?._id || null,
      hostFlat: hostFlat,
      society:  societyId,
      status:   "pending",
      isWalkIn: true,
      loggedBy: securityUser._id,
    });

    // Notify resident only when host is known.
    // notifyVisitorArrival includes societyId so multi-society users
    // auto-switch context when they tap the notification (TC-PN-004/006).
    if (host?.fcmToken) {
      await notifyVisitorArrival([host.fcmToken], visitor, societyId);
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

    // TC-033: Reject walk-in visitors who should not use OTP flow
    if (visitor.isWalkIn) {
      throw AppError.badRequest("Cannot verify OTP for walk-in visitors. Use the approval flow instead.");
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

    // OTP bypass flag — set BYPASS_OTP=true in .env to skip OTP verification
    // Useful during development / testing. Remove / set to false in production.
    const bypassOtp = process.env.BYPASS_OTP === "true";

    if (!bypassOtp && !visitor.verifyOTP(otp)) {
      throw AppError.badRequest("Invalid or expired OTP.");
    }

    const updated = await visitorRepository.markEntry(visitorId, securityUser._id);

    // Flow D: set auto-exit timer for deliveries
    if (visitor.purpose === "Delivery") {
      const autoExitMinutes = parseInt(process.env.DELIVERY_AUTO_EXIT_MINUTES || "15", 10);
      await visitorRepository.updateById(visitorId, {
        deliveryAutoExitAt: new Date(Date.now() + autoExitMinutes * 60 * 1000),
      });
    }

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

    // Flow D: set auto-exit timer for deliveries
    if (visitor.purpose === "Delivery") {
      const autoExitMinutes = parseInt(process.env.DELIVERY_AUTO_EXIT_MINUTES || "15", 10);
      await visitorRepository.updateById(visitorId, {
        deliveryAutoExitAt: new Date(Date.now() + autoExitMinutes * 60 * 1000),
      });
    }

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

  // ─── Flow C: Trusted Visitor Management ───────────────────────────────────

  /**
   * Resident registers a trusted/frequent visitor (maid, cook, driver, etc.)
   * with an optional schedule window and pass validity.
   */
  async registerTrustedVisitor(data, residentUser) {
    const societyId = this._getSocietyId(residentUser);

    // Compute validUntil from passType
    let validUntil = null;
    const passType = data.passType || "monthly";
    if (passType === "daily") {
      // FIX: was server-local setHours(23,59,59,999) — now correctly IST midnight.
      validUntil = endOfTodayIST();
    } else if (passType === "monthly") {
      validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
    // "permanent" → validUntil stays null

    const visitor = await visitorRepository.create({
      name:       data.name,
      phone:      data.phone || null,
      vehicleNumber: data.vehicleNumber || null,
      purpose:    "Service",
      note:       data.note || null,
      society:    societyId,
      host:       residentUser._id,
      hostFlat:   residentUser.flat,
      status:     "invited",  // active trusted pass — reusing "invited" to signal "live"
      isWalkIn:   false,
      isTrusted:  true,
      category:   data.category,
      passType,
      validUntil,
      accessSchedule: {
        days:     data.accessSchedule?.days     ?? [0, 1, 2, 3, 4, 5, 6],
        fromTime: data.accessSchedule?.fromTime ?? "00:00",
        toTime:   data.accessSchedule?.toTime   ?? "23:59",
      },
      idProofUrl: data.idProofUrl || null,
    });

    return visitor;
  }

  /**
   * Resident updates a trusted pass (reschedule, extend, revoke, etc.)
   */
  async updateTrustedVisitor(visitorId, data, residentUser) {
    const visitor = await visitorRepository.findById(visitorId);
    if (!visitor) throw AppError.notFound("Trusted visitor record not found.");
    if (!visitor.isTrusted) throw AppError.badRequest("This record is not a trusted visitor pass.");

    const hostId = visitor.host?._id?.toString() || visitor.host?.toString();
    if (hostId !== residentUser._id.toString()) {
      throw AppError.forbidden("You can only update your own trusted visitors.");
    }

    // Recompute validUntil if passType changed
    const updates = { ...data };
    if (data.passType) {
      if (data.passType === "daily") {
        updates.validUntil = endOfTodayIST();
      } else if (data.passType === "monthly") {
        updates.validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      } else {
        updates.validUntil = null; // permanent
      }
    }
    if (data.accessSchedule) {
      updates["accessSchedule.days"]     = data.accessSchedule.days     ?? visitor.accessSchedule.days;
      updates["accessSchedule.fromTime"] = data.accessSchedule.fromTime ?? visitor.accessSchedule.fromTime;
      updates["accessSchedule.toTime"]   = data.accessSchedule.toTime   ?? visitor.accessSchedule.toTime;
      delete updates.accessSchedule;
    }

    return visitorRepository.updateById(visitorId, updates);
  }

  /**
   * Resident revokes a trusted pass immediately.
   */
  async revokeTrustedVisitor(visitorId, residentUser) {
    const visitor = await visitorRepository.findById(visitorId);
    if (!visitor) throw AppError.notFound("Trusted visitor record not found.");
    if (!visitor.isTrusted) throw AppError.badRequest("This is not a trusted visitor pass.");

    const hostId = visitor.host?._id?.toString() || visitor.host?.toString();
    if (hostId !== residentUser._id.toString()) {
      throw AppError.forbidden("You can only revoke your own trusted visitors.");
    }
    if (["expired", "rejected"].includes(visitor.status)) {
      throw AppError.badRequest("This pass is already inactive.");
    }

    return visitorRepository.updateById(visitorId, {
      status: "expired",
      validUntil: new Date(), // force-expire now
    });
  }

  /**
   * Resident lists all their trusted visitor passes.
   */
  async getMyTrustedVisitors(residentUser, { activeOnly = false } = {}) {
    const filters = {};
    if (activeOnly) {
      filters.status = { $nin: ["expired", "rejected"] };
    }
    return visitorRepository.findTrustedByHost(residentUser._id, filters);
  }

  /**
   * Security guard: look up a trusted pass by phone or name.
   * Returns matching passes so the guard can confirm identity and auto-enter.
   */
  async lookupTrustedVisitor(societyId, { phone, name }) {
    if (!phone && !name) {
      throw AppError.badRequest("Provide phone or name to look up a trusted visitor.");
    }
    return visitorRepository.findTrustedBySociety(societyId, { phone, name });
  }

  /**
   * Security guard: auto-entry for a trusted visitor.
   * Checks schedule window, increments entryCount, sends silent log.
   * No resident push notification — only a daily digest (handled by job).
   */
  async trustedVisitorEntry(visitorId, securityUser) {
    const visitor = await visitorRepository.findById(visitorId);
    if (!visitor) throw AppError.notFound("Trusted visitor record not found.");
    if (!visitor.isTrusted) throw AppError.badRequest("This is not a trusted visitor pass.");

    const societyId = this._getSocietyId(securityUser);
    if (visitor.society.toString() !== societyId?.toString()) {
      throw AppError.forbidden("Access denied.");
    }

    // Check pass validity
    if (visitor.status === "expired") throw AppError.badRequest("This trusted pass has expired.");
    if (visitor.status === "rejected") throw AppError.badRequest("This trusted pass has been revoked.");
    if (visitor.validUntil && new Date() > visitor.validUntil) {
      await visitorRepository.updateById(visitorId, { status: "expired" });
      throw AppError.badRequest("This trusted pass has expired.");
    }

    // Check schedule window — FIX: was using server-local now.getDay()/getHours(),
    // which broke whenever the server process wasn't running in IST. All
    // accessSchedule values are entered by residents in IST, so the check
    // must compare against IST "now" too.
    const { dayOfWeek, hhmm: currentTime } = nowInIST();

    const schedule = visitor.accessSchedule;
    const allowedDays = schedule?.days ?? [0, 1, 2, 3, 4, 5, 6];
    const fromTime   = schedule?.fromTime ?? "00:00";
    const toTime     = schedule?.toTime   ?? "23:59";

    if (!allowedDays.includes(dayOfWeek)) {
      throw AppError.badRequest(
        `Entry not allowed today. Permitted days: ${allowedDays.map(d => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d]).join(", ")}.`
      );
    }
    if (currentTime < fromTime || currentTime > toTime) {
      throw AppError.badRequest(
        `Entry not allowed at this time. Permitted window: ${fromTime}–${toTime}.`
      );
    }

    const updated = await visitorRepository.recordTrustedEntry(visitorId);
    return updated;
  }

  // ─── Listing ───────────────────────────────────────────────────────────────

  /**
   * Admin / security: list all visitors for the society.
   */
  async getAllVisitors(societyId, query) {
    const { page, limit, skip } = parsePagination(query);
    const filters = {};
    // FIX (bug #1): trusted passes (isTrusted:true) reuse status:"invited" to
    // mean "active pass", which collided with the regular invite flow's use
    // of the same status to mean "awaiting gate OTP verification". Trusted
    // passes have their own dedicated Trusted tab/endpoints — they must never
    // surface in the main Visitors list, or the UI offers a "Verify OTP"
    // action that can never succeed (no OTP was ever generated for them).
    filters.isTrusted = { $ne: true };
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
    // FIX (bug #1): same reasoning as getAllVisitors above — keep trusted
    // passes out of the regular Visitors list; they live in the Trusted tab.
    filters.isTrusted = { $ne: true };
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
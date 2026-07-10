const maintenanceRepository = require("../repositories/maintenance.repository");
const userRepository = require("../repositories/user.repository");
const AppError = require("../utils/AppError");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const { sendPushNotification } = require("../utils/notification");
const User = require("../models/user.model");
const { Society } = require("../models/society.model");

class MaintenanceService {
  _getSocietyId(user) {
    return user.society?._id || user.society;
  }

  // ─── Admin: Create a Bill ──────────────────────────────────────────────────

  async createBill(data, adminUser) {
    const societyId = this._getSocietyId(adminUser);
    const bill = await maintenanceRepository.createBill({
      ...data,
      society: societyId,
      createdBy: adminUser._id,
    });
    return bill;
  }

  // ─── Admin: Publish Bill → Generate Payment Records ───────────────────────

  /**
   * Publishing a bill:
   * 1. Finds all targeted residents.
   * 2. Creates one PaymentRecord sub-doc per resident.
   * 3. Notifies all residents via push notification.
   */
  async publishBill(billId, adminUser) {
    const societyId = this._getSocietyId(adminUser);
    const bill = await maintenanceRepository.findBillById(billId);

    if (!bill) throw AppError.notFound("Bill not found.");
    if (bill.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    if (bill.isPublished) throw AppError.badRequest("Bill is already published.");

    // ── Find residents to bill ──────────────────────────────────────────────
    // society/role/isApproved are virtuals on User — must query the stored
    // memberships sub-array using $elemMatch instead.
    const membershipMatch = {
      society:    societyId,
      role:       "resident",
      isApproved: true,
      isActive:   true,
    };

    if (bill.targetMode === "specific" && bill.targetFlats.length > 0) {
      membershipMatch.flat = { $in: bill.targetFlats };
    }

    const residents = await User.find({
      memberships: { $elemMatch: membershipMatch },
      isActive: true,
    }).select("+fcmToken").lean();

    if (residents.length === 0) {
      throw AppError.badRequest("No eligible residents found to generate payment records for.");
    }

    // ── Build payment records ────────────────────────────────────────────────
    // flat/wing are also virtuals — read from the matching membership sub-doc.
    const paymentRecords = residents.map((r) => {
      const m = r.memberships.find(
        (mem) => mem.society.toString() === societyId.toString()
      );
      return {
        resident: r._id,
        flat:     m?.flat || "N/A",
        wing:     m?.wing || null,
        amount:   bill.baseAmount,
        penalty:  0,
        discount: 0,
        totalDue: bill.baseAmount,
        status:   "unpaid",
      };
    });

    // ── Persist: mark published + push payment records ───────────────────────
    await maintenanceRepository.addPaymentRecords(billId, paymentRecords);
    await maintenanceRepository.updateBill(billId, { isPublished: true });

    // ── Notify all residents ─────────────────────────────────────────────────
    const tokens = residents.map((r) => r.fcmToken).filter(Boolean);
    if (tokens.length > 0) {
      await sendPushNotification(
        tokens,
        {
          title: "🏠 New Maintenance Bill",
          body: `${bill.title} — ₹${bill.baseAmount} due by ${bill.dueDate.toLocaleDateString("en-IN")}`,
        },
        { type: "bill_published", billId: bill._id.toString(), societyId: societyId.toString() }
      );
    }

    return maintenanceRepository.findBillById(billId);
  }

  // ─── Admin: Update Bill (draft only) ──────────────────────────────────────

  async updateBill(billId, updates, adminUser) {
    const societyId = this._getSocietyId(adminUser);
    const bill = await maintenanceRepository.findBillById(billId);
    if (!bill) throw AppError.notFound("Bill not found.");
    if (bill.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    if (bill.isPublished) {
      throw AppError.badRequest("Published bills cannot be edited. Close the bill first.");
    }
    return maintenanceRepository.updateBill(billId, updates);
  }

  // ─── Admin: Close a Bill ───────────────────────────────────────────────────

  async closeBill(billId, adminUser) {
    const societyId = this._getSocietyId(adminUser);
    const bill = await maintenanceRepository.findBillById(billId);
    if (!bill) throw AppError.notFound("Bill not found.");
    if (bill.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    if (bill.isClosed) throw AppError.badRequest("Bill is already closed.");
    return maintenanceRepository.updateBill(billId, { isClosed: true });
  }

  // ─── Admin: Delete a draft bill ────────────────────────────────────────────
  async deleteBill(billId, adminUser) {
    const societyId = this._getSocietyId(adminUser);
    const bill = await maintenanceRepository.findBillById(billId);
    if (!bill) throw AppError.notFound("Bill not found.");
    if (bill.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    if (bill.isPublished) throw AppError.badRequest("Only draft bills can be deleted. Close the bill instead.");
    await bill.deleteOne();
  }

  // ─── Admin: Record a Payment ───────────────────────────────────────────────

  /**
   * Admin marks a flat's payment as received.
   * Updates the payment sub-doc with amount, method, txnId.
   */
  async recordPayment(billId, paymentId, paymentData, adminUser) {
    const societyId = this._getSocietyId(adminUser);
    const bill = await maintenanceRepository.findBillById(billId);
    if (!bill) throw AppError.notFound("Bill not found.");
    if (bill.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    if (!bill.isPublished) throw AppError.badRequest("Bill has not been published yet.");

    const paymentRecord = bill.payments.id(paymentId);
    if (!paymentRecord) throw AppError.notFound("Payment record not found.");
    if (paymentRecord.status === "paid") throw AppError.badRequest("This payment is already marked as paid.");

    const updates = {
      status: "paid",
      paidAmount: paymentData.paidAmount || paymentRecord.totalDue,
      paidAt: new Date(),
      paymentMethod: paymentData.paymentMethod,
      transactionId: paymentData.transactionId || null,
      receiptNote: paymentData.receiptNote || null,
    };

    const updatedBill = await maintenanceRepository.updatePaymentRecord(billId, paymentId, updates);

    // Notify the resident
    const resident = await userRepository.findById(paymentRecord.resident);
    if (resident?.fcmToken) {
      await sendPushNotification(
        [resident.fcmToken],
        {
          title: "✅ Payment Confirmed",
          body: `Your payment of ₹${updates.paidAmount} for "${bill.title}" has been recorded.`,
        },
        { type: "payment_confirmed", billId: bill._id.toString() }
      );
    }

    return updatedBill;
  }

  // ─── Admin: Apply Penalty to Overdue Records ───────────────────────────────

  async applyPenalty(billId, adminUser) {
    const societyId = this._getSocietyId(adminUser);
    const bill = await maintenanceRepository.findBillById(billId);
    if (!bill) throw AppError.notFound("Bill not found.");
    if (bill.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    if (!bill.penaltyEnabled) throw AppError.badRequest("Penalty is not enabled for this bill.");
    if (new Date() < bill.dueDate) throw AppError.badRequest("Due date has not passed yet.");
    if (bill.penaltyAppliedAt) throw AppError.badRequest("Penalty has already been applied to this bill.");

    await maintenanceRepository.applyPenaltyToOverdue(billId, bill.penaltyAmount);
    return maintenanceRepository.findBillById(billId);
  }

  // ─── Admin: Add Discount to a Specific Payment ────────────────────────────

  async applyDiscount(billId, paymentId, discount, adminUser) {
    const societyId = this._getSocietyId(adminUser);
    const bill = await maintenanceRepository.findBillById(billId);
    if (!bill) throw AppError.notFound("Bill not found.");
    if (bill.society.toString() !== societyId?.toString()) throw AppError.forbidden();

    const paymentRecord = bill.payments.id(paymentId);
    if (!paymentRecord) throw AppError.notFound("Payment record not found.");

    return maintenanceRepository.updatePaymentRecord(billId, paymentId, {
      discount,
      totalDue: Math.max(0, paymentRecord.amount + paymentRecord.penalty - discount),
    });
  }

  // ─── Listing ───────────────────────────────────────────────────────────────

  /**
   * List all bills for a society.
   *
   * BUG FIX (500): previously accepted only an `isAdmin` boolean.
   * Now accepts the full `requestingUser` so it can:
   *   1. Correctly determine admin vs resident role.
   *   2. Scope each bill's `payments` array to the calling resident's own
   *      record (Gap-1 fix) — prevents exposing other flats' payment data
   *      and ensures the `collectionSummary` virtual reflects only the
   *      resident's dues, not the society-wide totals.
   *
   * @param {ObjectId} societyId
   * @param {object}   query            - req.query (page, limit, billMonth, …)
   * @param {object}   requestingUser   - full req.user doc
   */
  async getAllBills(societyId, query, requestingUser) {
    const isAdmin = requestingUser.role === "admin";
    const { page, limit, skip } = parsePagination(query);
    const filters = {};

    // Residents only see published bills
    if (!isAdmin) filters.isPublished = true;

    if (query.billMonth) filters.billMonth = query.billMonth;
    if (query.isClosed !== undefined) filters.isClosed = query.isClosed === "true";

    const { bills, total } = await maintenanceRepository.findBillsBySociety(
      societyId,
      filters,
      { skip, limit }
    );

    // Gap-1 fix: scope each bill's payments to just the resident's own record.
    // Admins see all payments unchanged.
    if (!isAdmin) {
      const residentId = requestingUser._id.toString();
      const scopedBills = bills.map((bill) => {
        // toJSON() triggers virtuals — call it first so we get the full
        // virtual set, then override payments with the scoped record.
        const billObj = bill.toJSON ? bill.toJSON() : { ...bill };
        const myPayment = (bill.payments || []).find(
          (p) => p.resident?.toString() === residentId
        );
        billObj.payments = myPayment ? [myPayment] : [];
        // Re-compute summary virtuals with scoped payments so the card shows
        // the resident's own amount due, not the society-wide total.
        const p = myPayment || {};
        billObj.totalFlats       = myPayment ? 1 : 0;
        billObj.paidCount        = p.status === "paid" || p.status === "waived" ? 1 : 0;
        billObj.unpaidCount      = p.status === "unpaid" || p.status === "overdue" ? 1 : 0;
        billObj.collectionSummary = {
          total:     p.totalDue    || 0,
          collected: p.paidAmount  || 0,
          pending:   (p.totalDue   || 0) - (p.paidAmount || 0),
        };
        return billObj;
      });
      return { bills: scopedBills, meta: buildPaginationMeta({ total, page, limit }) };
    }

    return { bills, meta: buildPaginationMeta({ total, page, limit }) };
  }

  /**
   * Get a single bill. Admins see all payments; residents see only their own.
   */
  async getBillById(billId, requestingUser) {
    const bill = await maintenanceRepository.findBillById(billId);
    if (!bill) throw AppError.notFound("Bill not found.");

    const societyId = this._getSocietyId(requestingUser);
    if (bill.society.toString() !== societyId?.toString()) throw AppError.forbidden();

    if (requestingUser.role !== "admin") {
      if (!bill.isPublished) throw AppError.notFound("Bill not found.");
      // Return only the resident's own payment record
      const myPayment = bill.payments.find(
        (p) => p.resident.toString() === requestingUser._id.toString()
      );
      const billObj = bill.toJSON();
      billObj.payments = myPayment ? [myPayment] : [];
      return billObj;
    }

    return bill;
  }

  /**
   * Resident: get all their own payment records across all bills.
   *
   * BUGFIX: previously called _getSocietyId(residentUser) which reads
   * user.society (= user.activeSocietyId virtual). If activeSocietyId is not
   * populated on the user doc, this returns null → the aggregate finds nothing.
   *
   * The reliable societyId is always req.societyId (decoded from the JWT by
   * auth middleware). The controller now passes it through explicitly.
   */
  async getMyPayments(residentUser, societyId, query) {
    const { page, limit, skip } = parsePagination(query);
    const records = await maintenanceRepository.findAllPaymentsByResident(
      societyId,
      residentUser._id,
      { skip, limit }
    );
    return records;
  }

  /**
   * Admin: get outstanding defaulters across all published bills.
   */
  async getDefaulters(societyId, query) {
    const { page, limit, skip } = parsePagination(query);
    return maintenanceRepository.findDefaultersBySociety(societyId, { skip, limit });
  }

  // ─── Manual payment proof (cash / bank transfer / UPI QR / cheque) ─────────

  /**
   * Resident: submit proof of an offline payment (method + UTR/reference).
   * Moves the record to "pending_verification" and notifies the society admin.
   * Does NOT mark the bill paid — an admin must verify first.
   */
  async submitPaymentProof(billId, paymentId, proofData, residentUser) {
    const societyId = this._getSocietyId(residentUser);
    const bill = await maintenanceRepository.findBillById(billId);
    if (!bill) throw AppError.notFound("Bill not found.");
    if (bill.society.toString() !== societyId?.toString()) throw AppError.forbidden();
    if (!bill.isPublished) throw AppError.badRequest("Bill has not been published yet.");

    const paymentRecord = bill.payments.id(paymentId);
    if (!paymentRecord) throw AppError.notFound("Payment record not found.");
    if (paymentRecord.resident.toString() !== residentUser._id.toString()) {
      throw AppError.forbidden("You can only submit proof for your own payment record.");
    }
    if (paymentRecord.status === "paid") {
      throw AppError.badRequest("This payment has already been confirmed.");
    }
    if (paymentRecord.verificationStatus === "pending_verification") {
      throw AppError.badRequest("Proof already submitted and awaiting verification.");
    }

    const updatedBill = await maintenanceRepository.submitPaymentProof(billId, paymentId, {
      submittedMethod: proofData.submittedMethod,
      submittedAmount: proofData.submittedAmount ?? paymentRecord.totalDue,
      utrNumber:       proofData.utrNumber,
      proofNote:       proofData.proofNote,
    });

    // Notify the society admin so it shows up in their verification queue
    const admin = await userRepository.findById(bill.createdBy);
    if (admin?.fcmToken) {
      await sendPushNotification(
        [admin.fcmToken],
        {
          title: "💰 Payment submitted for verification",
          body: `Flat ${paymentRecord.flat} submitted ₹${proofData.submittedAmount ?? paymentRecord.totalDue} — tap to verify.`,
        },
        { type: "payment_submitted", billId: bill._id.toString(), paymentId: paymentId.toString() }
      );
    }

    return updatedBill;
  }

  /**
   * Admin: approve a submitted proof → payment marked paid.
   */
  async verifyPayment(billId, paymentId, adminUser) {
    const societyId = this._getSocietyId(adminUser);
    const bill = await maintenanceRepository.findBillById(billId);
    if (!bill) throw AppError.notFound("Bill not found.");
    if (bill.society.toString() !== societyId?.toString()) throw AppError.forbidden();

    const paymentRecord = bill.payments.id(paymentId);
    if (!paymentRecord) throw AppError.notFound("Payment record not found.");
    if (paymentRecord.verificationStatus !== "pending_verification") {
      throw AppError.badRequest("This payment has no submission awaiting verification.");
    }

    const updatedBill = await maintenanceRepository.updatePaymentRecord(billId, paymentId, {
      status:             "paid",
      verificationStatus: "verified",
      paidAmount:         paymentRecord.submittedAmount,
      paidAt:             new Date(),
      paymentMethod:      paymentRecord.submittedMethod,
      transactionId:      paymentRecord.utrNumber,
      verifiedAt:         new Date(),
      verifiedBy:         adminUser._id,
      rejectionReason:    null,
    });

    const resident = await userRepository.findById(paymentRecord.resident);
    if (resident?.fcmToken) {
      await sendPushNotification(
        [resident.fcmToken],
        {
          title: "✅ Payment Confirmed",
          body: `Your payment of ₹${paymentRecord.submittedAmount} for "${bill.title}" has been verified.`,
        },
        { type: "payment_confirmed", billId: bill._id.toString() }
      );
    }

    return updatedBill;
  }

  /**
   * Admin: reject a submitted proof (e.g. UTR not found / amount mismatch).
   * Record goes back to unpaid so the resident can resubmit.
   */
  async rejectPayment(billId, paymentId, reason, adminUser) {
    const societyId = this._getSocietyId(adminUser);
    const bill = await maintenanceRepository.findBillById(billId);
    if (!bill) throw AppError.notFound("Bill not found.");
    if (bill.society.toString() !== societyId?.toString()) throw AppError.forbidden();

    const paymentRecord = bill.payments.id(paymentId);
    if (!paymentRecord) throw AppError.notFound("Payment record not found.");
    if (paymentRecord.verificationStatus !== "pending_verification") {
      throw AppError.badRequest("This payment has no submission awaiting verification.");
    }

    const updatedBill = await maintenanceRepository.rejectPaymentProof(billId, paymentId, reason);

    const resident = await userRepository.findById(paymentRecord.resident);
    if (resident?.fcmToken) {
      await sendPushNotification(
        [resident.fcmToken],
        {
          title: "⚠️ Payment could not be verified",
          body: reason
            ? `Your submission for "${bill.title}" was rejected: ${reason}. Please resubmit.`
            : `Your submission for "${bill.title}" could not be verified. Please resubmit.`,
        },
        { type: "payment_rejected", billId: bill._id.toString() }
      );
    }

    return updatedBill;
  }

  /**
   * Admin: list of payment records across the society awaiting verification.
   */
  async getPendingVerifications(societyId, query) {
    const { page, limit, skip } = parsePagination(query);
    return maintenanceRepository.findPendingVerifications(societyId, { skip, limit });
  }

  // ─── Payment-verification on/off switch (society admin, self-service) ─────
  // Separate from SA's enabledModules.maintenance — this only pauses/resumes
  // proof submission + verify/reject for the admin's own society. Bill
  // creation and viewing are never affected by this flag. Reading current
  // state is handled by GET /modules/status (module.controller.js), which
  // already returns this field for any society member.

  /**
   * Admin (chairman/secretary): toggle it for their own society only.
   * Scoped strictly to adminUser's society — cannot affect any other society.
   */
  async setPaymentVerificationStatus(enabled, adminUser) {
    if (typeof enabled !== "boolean") {
      throw AppError.badRequest("`enabled` must be true or false.");
    }
    const societyId = this._getSocietyId(adminUser);
    const society = await Society.findById(societyId);
    if (!society) throw AppError.notFound("Society not found.");

    society.paymentVerificationEnabled = enabled;
    await society.save();

    return { paymentVerificationEnabled: society.paymentVerificationEnabled };
  }
}

module.exports = new MaintenanceService();
/**
 * controllers/maintenance.controller.js
 *
 * CHANGED IN TASK 2:
 *   createBill()      → "maintenance.bill_created"
 *   publishBill()     → "maintenance.bill_published"
 *   updateBill()      → "maintenance.bill_updated"
 *   closeBill()       → "maintenance.bill_closed"
 *   deleteBill()      → "maintenance.bill_deleted"
 *   recordPayment()   → "maintenance.payment_recorded"
 *   applyPenalty()    → "maintenance.penalty_applied"
 *   applyDiscount()   → "maintenance.discount_applied"
 *
 * Read-only methods (getAllBills, getBillById, getDefaulters, getMyPayments)
 * are UNCHANGED.
 */

const maintenanceService = require("../services/maintenance.service");
const { sendSuccess }    = require("../utils/response");
const { audit }          = require("../middlewares/audit.middleware"); // NEW

class MaintenanceController {
  // ── Admin: Create a draft bill ────────────────────────────────────────────
  async createBill(req, res) {
    const bill = await maintenanceService.createBill(req.body, req.user);

    await audit(req, "maintenance.bill_created", "MaintenanceBill", bill._id, {
      title:  bill.title,
      amount: bill.amount,
    });

    return sendSuccess(res, {
      statusCode: 201,
      message: "Maintenance bill created as draft. Publish it to notify residents.",
      data: { bill },
    });
  }

  // ── Admin: Publish bill → generate per-flat payment records ──────────────
  async publishBill(req, res) {
    const bill = await maintenanceService.publishBill(req.params.id, req.user);

    await audit(req, "maintenance.bill_published", "MaintenanceBill", bill._id, {
      title:      bill.title,
      dueDate:    bill.dueDate,
      totalFlats: bill.payments?.length,
    });

    return sendSuccess(res, {
      message: "Bill published and residents notified.",
      data: { bill },
    });
  }

  // ── Admin: Update a draft bill ────────────────────────────────────────────
  async updateBill(req, res) {
    const bill = await maintenanceService.updateBill(req.params.id, req.body, req.user);

    await audit(req, "maintenance.bill_updated", "MaintenanceBill", bill._id, {
      updatedFields: Object.keys(req.body),
    });

    return sendSuccess(res, {
      message: "Bill updated.",
      data: { bill },
    });
  }

  // ── Admin: Close a bill ───────────────────────────────────────────────────
  async closeBill(req, res) {
    const bill = await maintenanceService.closeBill(req.params.id, req.user);

    await audit(req, "maintenance.bill_closed", "MaintenanceBill", bill._id, {
      closedBy: req.user._id,
    });

    return sendSuccess(res, {
      message: "Bill closed.",
      data: { bill },
    });
  }

  // ── Admin: Delete a draft bill ────────────────────────────────────────────
  async deleteBill(req, res) {
    // Fetch bill id before deletion for the log
    const billId = req.params.id;
    await maintenanceService.deleteBill(billId, req.user);

    await audit(req, "maintenance.bill_deleted", "MaintenanceBill", billId, {
      deletedBy: req.user._id,
    });

    return sendSuccess(res, { message: "Draft bill deleted." });
  }

  // ── Admin: Record payment for a flat ─────────────────────────────────────
  async recordPayment(req, res) {
    const bill = await maintenanceService.recordPayment(
      req.params.billId,
      req.params.paymentId,
      req.body,
      req.user
    );

    await audit(req, "maintenance.payment_recorded", "MaintenanceBill", req.params.billId, {
      paymentId: req.params.paymentId,
      amount:    req.body.amount,
      method:    req.body.paymentMethod,
    });

    return sendSuccess(res, {
      message: "Payment recorded.",
      data: { bill },
    });
  }

  // ── Admin: Apply penalty to all overdue records ───────────────────────────
  async applyPenalty(req, res) {
    const bill = await maintenanceService.applyPenalty(req.params.id, req.user);

    await audit(req, "maintenance.penalty_applied", "MaintenanceBill", bill._id, {
      appliedBy: req.user._id,
    });

    return sendSuccess(res, {
      message: "Penalty applied to all overdue payment records.",
      data: { bill },
    });
  }

  // ── Admin: Apply discount to a specific payment record ────────────────────
  async applyDiscount(req, res) {
    const bill = await maintenanceService.applyDiscount(
      req.params.billId,
      req.params.paymentId,
      req.body.discount,
      req.user
    );

    await audit(req, "maintenance.discount_applied", "MaintenanceBill", req.params.billId, {
      paymentId: req.params.paymentId,
      discount:  req.body.discount,
    });

    return sendSuccess(res, {
      message: "Discount applied.",
      data: { bill },
    });
  }

  // ── Admin: Defaulter list ─────────────────────────────────────────────────
  async getDefaulters(req, res) {
    const defaulters = await maintenanceService.getDefaulters(req.societyId, req.query);
    return sendSuccess(res, { data: { defaulters } });
  }

  // ── Both: List bills ──────────────────────────────────────────────────────
  async getAllBills(req, res) {
    const { bills, meta } = await maintenanceService.getAllBills(
      req.societyId,
      req.query,
      req.user
    );
    return sendSuccess(res, { data: { bills }, meta });
  }

  // ── Both: Get single bill ─────────────────────────────────────────────────
  async getBillById(req, res) {
    const bill = await maintenanceService.getBillById(req.params.id, req.user);
    return sendSuccess(res, { data: { bill } });
  }

  // ── Resident: My payment history ─────────────────────────────────────────
  async getMyPayments(req, res) {
    // BUGFIX: pass req.societyId (from JWT, always reliable) explicitly.
    // The service previously derived societyId from user.society virtual
    // which can be null if activeSocietyId is not set on the user doc.
    const records = await maintenanceService.getMyPayments(req.user, req.societyId, req.query);
    return sendSuccess(res, {
      data: { payments: records },
    });
  }
}

module.exports = new MaintenanceController();
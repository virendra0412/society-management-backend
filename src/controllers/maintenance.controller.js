const maintenanceService = require("../services/maintenance.service");
const { sendSuccess } = require("../utils/response");

class MaintenanceController {
  // ── Admin: Create a draft bill ────────────────────────────────────────────
  async createBill(req, res) {
    const bill = await maintenanceService.createBill(req.body, req.user);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Maintenance bill created as draft. Publish it to notify residents.",
      data: { bill },
    });
  }

  // ── Admin: Publish bill → generate per-flat payment records ──────────────
  async publishBill(req, res) {
    const bill = await maintenanceService.publishBill(req.params.id, req.user);
    return sendSuccess(res, {
      message: "Bill published and residents notified.",
      data: { bill },
    });
  }

  // ── Admin: Update a draft bill ────────────────────────────────────────────
  async updateBill(req, res) {
    const bill = await maintenanceService.updateBill(req.params.id, req.body, req.user);
    return sendSuccess(res, {
      message: "Bill updated.",
      data: { bill },
    });
  }

  // ── Admin: Close a bill ───────────────────────────────────────────────────
  async closeBill(req, res) {
    const bill = await maintenanceService.closeBill(req.params.id, req.user);
    return sendSuccess(res, {
      message: "Bill closed.",
      data: { bill },
    });
  }

  // ── Admin: Record payment for a flat ─────────────────────────────────────
  async recordPayment(req, res) {
    const bill = await maintenanceService.recordPayment(
      req.params.billId,
      req.params.paymentId,
      req.body,
      req.user
    );
    return sendSuccess(res, {
      message: "Payment recorded.",
      data: { bill },
    });
  }

  // ── Admin: Apply penalty to all overdue records ───────────────────────────
  async applyPenalty(req, res) {
    const bill = await maintenanceService.applyPenalty(req.params.id, req.user);
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
    return sendSuccess(res, {
      message: "Discount applied.",
      data: { bill },
    });
  }

  // ── Both: List bills ──────────────────────────────────────────────────────
  async getAllBills(req, res) {
    const isAdmin = req.user.role === "admin";
    const { bills, meta } = await maintenanceService.getAllBills(
      req.societyId,
      req.query,
      isAdmin
    );
    return sendSuccess(res, { data: { bills }, meta });
  }

  // ── Both: Get single bill ─────────────────────────────────────────────────
  async getBillById(req, res) {
    const bill = await maintenanceService.getBillById(req.params.id, req.user);
    return sendSuccess(res, { data: { bill } });
  }

  // ── Resident: My payment history across all bills ────────────────────────
  async getMyPayments(req, res) {
    const records = await maintenanceService.getMyPayments(req.user, req.query);
    return sendSuccess(res, {
      data: { payments: records },
    });
  }
}

module.exports = new MaintenanceController();

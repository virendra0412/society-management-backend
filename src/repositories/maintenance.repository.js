const MaintenanceBill = require("../models/maintenance.model");

class MaintenanceRepository {
  // ─── Bills ─────────────────────────────────────────────────────────────────

  async createBill(data) {
    return MaintenanceBill.create(data);
  }

  async findBillById(id) {
    return MaintenanceBill.findById(id)
      .populate("createdBy", "name role")
      .exec();
  }

  /**
   * List bills for a society.
   *
   * BUG FIX: the previous version used .select("-payments") to avoid loading
   * the sub-array. However the model's toJSON has `virtuals: true`, and all
   * four virtuals (totalFlats, paidCount, unpaidCount, collectionSummary)
   * iterate over `this.payments`. When excluded, `this.payments` is `undefined`
   * (Mongoose does NOT apply schema defaults to projected-out fields), causing
   * a TypeError → 500 on every list request.
   *
   * Fix: include the payments array so virtuals compute correctly.
   * The list is paginated (default 20 bills) and societies are typically
   * small enough that this is fine. If scale becomes a concern, replace
   * with an aggregation pipeline that computes stats server-side and then
   * projects payments out of the response.
   */
  async findBillsBySociety(societyId, filters = {}, { skip, limit }) {
    const query = { society: societyId, ...filters };
    const [bills, total] = await Promise.all([
      MaintenanceBill.find(query)
        .populate("createdBy", "name role")
        .sort({ dueDate: -1 })
        .skip(skip)
        .limit(limit),
      MaintenanceBill.countDocuments(query),
    ]);
    return { bills, total };
  }

  async updateBill(billId, updates) {
    return MaintenanceBill.findByIdAndUpdate(billId, updates, {
      new: true,
      runValidators: true,
    }).exec();
  }

  async deleteBill(billId) {
    return MaintenanceBill.findByIdAndDelete(billId).exec();
  }

  // ─── Payments (sub-documents) ──────────────────────────────────────────────

  /**
   * Add a batch of payment records to a bill.
   */
  async addPaymentRecords(billId, records) {
    return MaintenanceBill.findByIdAndUpdate(
      billId,
      { $push: { payments: { $each: records } } },
      { new: true }
    ).exec();
  }

  /**
   * Get a single bill showing only one resident's payment record.
   * Used for the resident's "my bill" view.
   */
  async findPaymentByResident(billId, residentId) {
    return MaintenanceBill.findOne(
      { _id: billId, "payments.resident": residentId },
      {
        title: 1, description: 1, billMonth: 1, baseAmount: 1,
        dueDate: 1, isPublished: 1,
        "payments.$": 1,          // Project only the matching payment element
      }
    ).exec();
  }

  /**
   * Get all payment records for a specific resident across all bills.
   */
  async findAllPaymentsByResident(societyId, residentId, { skip, limit }) {
    const pipeline = [
      { $match: { society: societyId, isPublished: true, "payments.resident": residentId } },
      { $unwind: "$payments" },
      { $match: { "payments.resident": residentId } },
      { $sort: { dueDate: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          billId: "$_id",
          title: 1, billMonth: 1, dueDate: 1,
          payment: "$payments",
        },
      },
    ];
    return MaintenanceBill.aggregate(pipeline).exec();
  }

  /**
   * Update a specific payment record inside a bill (by payment sub-doc _id).
   */
  async updatePaymentRecord(billId, paymentId, updates) {
    const setObj = {};
    Object.entries(updates).forEach(([k, v]) => {
      setObj[`payments.$.${k}`] = v;
    });

    return MaintenanceBill.findOneAndUpdate(
      { _id: billId, "payments._id": paymentId },
      { $set: setObj },
      { new: true, runValidators: true }
    ).exec();
  }

  /**
   * Apply penalty to all overdue (unpaid past dueDate) payment records in a bill.
   */
  async applyPenaltyToOverdue(billId, penaltyAmount) {
    return MaintenanceBill.updateOne(
      { _id: billId },
      {
        $inc: { "payments.$[elem].penalty": penaltyAmount },
        $set: { "payments.$[elem].status": "overdue" },
      },
      {
        arrayFilters: [
          { "elem.status": "unpaid" },
        ],
        new: true,
      }
    ).exec();
  }

  /**
   * Find all bills that:
   * - Are published
   * - Have unpaid/overdue records
   * - Due date has passed
   * Used by the reminder job.
   */
  async findBillsNeedingReminders() {
    return MaintenanceBill.find({
      isPublished: true,
      isClosed: false,
      dueDate: { $lt: new Date() },
      "payments.status": { $in: ["unpaid", "overdue"] },
    })
      .populate("society", "name admin")
      .select("title dueDate payments society penaltyEnabled penaltyAmount")
      .exec();
  }

  /**
   * Increment remindersSent and update lastReminderAt on a specific payment record.
   */
  async markReminderSent(billId, paymentId) {
    return MaintenanceBill.updateOne(
      { _id: billId, "payments._id": paymentId },
      {
        $inc: { "payments.$.remindersSent": 1 },
        $set: { "payments.$.lastReminderAt": new Date() },
      }
    ).exec();
  }
}

module.exports = new MaintenanceRepository();

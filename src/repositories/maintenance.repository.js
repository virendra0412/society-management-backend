const mongoose      = require("mongoose");
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
    const sid = new mongoose.Types.ObjectId(societyId);
    const rid = new mongoose.Types.ObjectId(residentId);
    const pipeline = [
      { $match: { society: sid, isPublished: true, "payments.resident": rid } },
      { $unwind: "$payments" },
      { $match: { "payments.resident": rid } },
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

  async findDefaultersBySociety(societyId, { skip, limit }) {
    // BUGFIX: societyId arrives as a string from the JWT middleware.
    // Aggregation $match on an ObjectId field requires an ObjectId — a string
    // never matches, so the pipeline returns zero results without this cast.
    const sid = new mongoose.Types.ObjectId(societyId);

    return MaintenanceBill.aggregate([
      {
        $match: {
          society:            sid,
          isPublished:        true,
          "payments.status":  { $in: ["unpaid", "overdue"] },
        },
      },
      { $unwind: "$payments" },
      { $match: { "payments.status": { $in: ["unpaid", "overdue"] } } },
      {
        $lookup: {
          from:         "users",
          localField:   "payments.resident",
          foreignField: "_id",
          as:           "resident",
        },
      },
      { $unwind: { path: "$resident", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id:      "$payments.resident",
          flat:     { $first: "$payments.flat" },
          wing:     { $first: "$payments.wing" },
          resident: { $first: "$resident" },
          // Sum all outstanding amounts across every defaulted bill
          totalOutstanding: {
            $sum: {
              $subtract: [
                { $ifNull: ["$payments.totalDue", "$payments.amount"] },
                { $ifNull: ["$payments.paidAmount", 0] },
              ],
            },
          },
          records: {
            $push: {
              _id:      "$payments._id",
              status:   "$payments.status",
              amount:   "$payments.amount",
              penalty:  "$payments.penalty",
              discount: "$payments.discount",
              totalDue: {
                $ifNull: [
                  "$payments.totalDue",
                  { $subtract: [
                      { $add: ["$payments.amount", { $ifNull: ["$payments.penalty", 0] }] },
                      { $ifNull: ["$payments.discount", 0] },
                  ]},
                ],
              },
              remindersSent:  "$payments.remindersSent",
              lastReminderAt: "$payments.lastReminderAt",
              bill: {
                _id:       "$_id",
                title:     "$title",
                billMonth: "$billMonth",
                dueDate:   "$dueDate",
              },
            },
          },
        },
      },
      { $sort: { flat: 1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id:              1,
          flat:             1,
          wing:             1,
          totalOutstanding: 1,
          resident: {
            _id:   "$resident._id",
            name:  "$resident.name",
            phone: "$resident.phone",
          },
          records: 1,
        },
      },
    ]).exec();
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
        $set: {
          "payments.$[elem].status": "overdue",
          penaltyAppliedAt: new Date(),
        },
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
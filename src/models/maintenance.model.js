const mongoose = require("mongoose");

/**
 * Maintenance / Payments
 *
 * Flow:
 *   1. Admin creates a MaintenanceBill for a society (e.g. "Jan 2025 — ₹2500")
 *      - The bill targets either ALL flats or a specific list of flats.
 *   2. The system (or admin manually) generates individual PaymentRecord sub-docs
 *      for each targeted flat/resident.
 *   3. Resident pays → payment recorded (amount, method, txnId) → status: "paid"
 *   4. A cron job runs daily and sends reminders for overdue "unpaid" records.
 */

// ─── Payment Record (per-flat/per-resident) ───────────────────────────────────
const paymentRecordSchema = new mongoose.Schema(
  {
    resident: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    flat: {
      type: String,
      trim: true,
      required: true,
    },
    wing: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Amount ────────────────────────────────────────────────────────────────
    // Base amount from the parent bill; can be overridden per flat (e.g. penalty, discount)
    amount: {
      type: Number,
      required: true,
      min: [0, "Amount cannot be negative"],
    },
    penalty: {
      // Late payment penalty (added automatically by the cron job if enabled)
      type: Number,
      default: 0,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Final amount due = amount + penalty - discount
    totalDue: {
      type: Number,
    },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["unpaid", "paid", "overdue", "waived", "partial"],
      default: "unpaid",
      index: true,
    },

    // ── Payment Details (filled when status → "paid") ─────────────────────────
    paidAmount: {
      type: Number,
      default: 0,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "upi", "neft", "cheque", "other", null],
      default: null,
    },
    transactionId: {
      // UPI txn ID, cheque number, reference, etc.
      type: String,
      trim: true,
      maxlength: [100, "Transaction ID too long"],
      default: null,
    },
    receiptNote: {
      type: String,
      trim: true,
      maxlength: [300, "Note too long"],
      default: null,
    },

    // ── Reminders ─────────────────────────────────────────────────────────────
    remindersSent: {
      type: Number,
      default: 0,
    },
    lastReminderAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: true,
    timestamps: true,
  }
);

// Auto-compute totalDue before saving
paymentRecordSchema.pre("save", function (next) {
  this.totalDue = Math.max(0, this.amount + (this.penalty || 0) - (this.discount || 0));
  next();
});

// ─── Main Bill Schema ─────────────────────────────────────────────────────────
const maintenanceBillSchema = new mongoose.Schema(
  {
    society: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Society",
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ── Bill Identity ─────────────────────────────────────────────────────────
    title: {
      type: String,
      required: [true, "Bill title is required"],
      trim: true,
      maxlength: [150, "Title too long"],
      // e.g. "January 2025 Maintenance", "Diwali Special Levy"
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description too long"],
      default: null,
    },
    billMonth: {
      // ISO month string for easy filtering: "2025-01", "2025-02", …
      type: String,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, "billMonth must be YYYY-MM format"],
      default: null,
    },

    // ── Amount & Due Date ─────────────────────────────────────────────────────
    baseAmount: {
      type: Number,
      required: [true, "Base amount is required"],
      min: [1, "Amount must be positive"],
    },
    dueDate: {
      type: Date,
      required: [true, "Due date is required"],
    },

    // ── Late penalty settings ─────────────────────────────────────────────────
    penaltyEnabled: {
      type: Boolean,
      default: false,
    },
    penaltyAmount: {
      // Fixed rupee penalty applied per overdue record
      type: Number,
      default: 0,
      min: 0,
    },

    // ── Targeting ─────────────────────────────────────────────────────────────
    // "all"  → bill applies to every approved resident in the society
    // "specific" → bill applies only to flats listed in targetFlats
    targetMode: {
      type: String,
      enum: ["all", "specific"],
      default: "all",
    },
    targetFlats: {
      // Used only when targetMode === "specific"
      type: [String],
      default: [],
    },

    // ── Status ────────────────────────────────────────────────────────────────
    isPublished: {
      type: Boolean,
      default: false,
      // Bills start as draft. Admin publishes → residents are notified & can pay.
    },
    isClosed: {
      type: Boolean,
      default: false,
    },

    // ── Per-flat payment records ───────────────────────────────────────────────
    payments: {
      type: [paymentRecordSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
maintenanceBillSchema.index({ society: 1, dueDate: -1 });
maintenanceBillSchema.index({ society: 1, billMonth: 1 });
maintenanceBillSchema.index({ society: 1, isPublished: 1 });
// For reminder job: quickly find unpaid/overdue records across all bills
maintenanceBillSchema.index({ "payments.status": 1, "payments.lastReminderAt": 1 });

// ─── Virtuals ─────────────────────────────────────────────────────────────────
maintenanceBillSchema.virtual("totalFlats").get(function () {
  return this.payments.length;
});

maintenanceBillSchema.virtual("paidCount").get(function () {
  return this.payments.filter((p) => p.status === "paid" || p.status === "waived").length;
});

maintenanceBillSchema.virtual("unpaidCount").get(function () {
  return this.payments.filter((p) => p.status === "unpaid" || p.status === "overdue").length;
});

maintenanceBillSchema.virtual("collectionSummary").get(function () {
  const total = this.payments.reduce((s, p) => s + (p.totalDue || 0), 0);
  const collected = this.payments.reduce((s, p) => s + (p.paidAmount || 0), 0);
  return { total, collected, pending: total - collected };
});

const MaintenanceBill = mongoose.model("MaintenanceBill", maintenanceBillSchema);

module.exports = MaintenanceBill;

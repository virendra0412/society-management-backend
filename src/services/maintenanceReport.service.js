/**
 * services/maintenanceReport.service.js
 *
 * Aggregates MongoDB data for all 5 maintenance reports.
 * Controllers call these methods, then pass the result to a report utility
 * (reportHtml.js or reportCsv.js) for formatting.
 *
 * Reports:
 *   getBillData(billId, societyId)
 *   getReceiptData(billId, paymentId, societyId)
 *   getCollectionData(month, societyId)            month = "YYYY-MM"
 *   getHistoryData(residentId, societyId, query)
 *   getSummaryData(year, societyId)
 */

const mongoose              = require("mongoose");
const MaintenanceBill       = require("../models/maintenance.model");
const { Society }           = require("../models/society.model");
const User                  = require("../models/user.model");
const AppError              = require("../utils/AppError");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toOid = (id) => new mongoose.Types.ObjectId(id);

const _getSociety = async (societyId) => {
  const s = await Society.findById(societyId, "name address city state").lean();
  if (!s) throw AppError.notFound("Society not found.");
  return s;
};

// Build a name → resident map for a set of resident IDs
const _populateNames = async (residentIds) => {
  const users = await User.find(
    { _id: { $in: residentIds } },
    "name flat wing"
  ).lean();
  const map = {};
  for (const u of users) map[u._id.toString()] = u;
  return map;
};

// Compute stats from a flat array of payment sub-docs
const _paymentStats = (payments) => {
  const totalFlats  = payments.length;
  const totalBilled = payments.reduce((s, p) => s + (p.totalDue || 0), 0);
  const collected   = payments
    .filter((p) => p.status === "paid" || p.status === "waived")
    .reduce((s, p) => s + (p.paidAmount || p.totalDue || 0), 0);
  const pending     = totalBilled - collected;
  const paidCount   = payments.filter((p) => p.status === "paid" || p.status === "waived").length;
  const unpaidCount = payments.filter((p) => p.status === "unpaid" || p.status === "overdue").length;
  const defaulters  = payments.filter((p) => p.status === "overdue").length;
  const collectionPct = totalBilled > 0 ? (collected / totalBilled) * 100 : 0;
  return { totalFlats, totalBilled, collected, pending, paidCount, unpaidCount, defaulters, collectionPct };
};

// ─── 1. Maintenance Bill ───────────────────────────────────────────────────────

const getBillData = async (billId, societyId) => {
  const bill = await MaintenanceBill
    .findOne({ _id: billId, society: toOid(societyId) })
    .lean();

  if (!bill) throw AppError.notFound("Bill not found.");
  if (!bill.isPublished) throw AppError.badRequest("Bill must be published to generate a report.");

  const society = await _getSociety(societyId);

  // Attach resident names to each payment record
  const residentIds = bill.payments.map((p) => p.resident);
  const nameMap     = await _populateNames(residentIds);

  const payments = bill.payments.map((p) => ({
    ...p,
    residentName: nameMap[p.resident?.toString()]?.name || null,
  }));

  const stats = _paymentStats(payments);
  return { bill: { ...bill, payments }, stats, society };
};

// ─── 2. Payment Receipt ────────────────────────────────────────────────────────

const getReceiptData = async (billId, paymentId, societyId) => {
  const bill = await MaintenanceBill
    .findOne({ _id: billId, society: toOid(societyId) })
    .lean();
  if (!bill) throw AppError.notFound("Bill not found.");

  const payment = bill.payments.find((p) => p._id.toString() === paymentId);
  if (!payment) throw AppError.notFound("Payment record not found.");
  if (payment.status !== "paid" && payment.status !== "waived") {
    throw AppError.badRequest("Receipt can only be generated for paid or waived records.");
  }

  const society  = await _getSociety(societyId);
  const resident = await User.findById(payment.resident, "name flat wing").lean();

  // Get verifier name if available
  let verifiedByName = null;
  if (payment.verifiedBy) {
    const verifier = await User.findById(payment.verifiedBy, "name").lean();
    verifiedByName = verifier?.name || null;
  }

  return {
    bill,
    payment: { ...payment, verifiedByName },
    residentName: resident?.name || "Resident",
    society,
  };
};

// ─── 3. Monthly Collection ────────────────────────────────────────────────────

const getCollectionData = async (month, societyId) => {
  // month = "YYYY-MM"
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw AppError.badRequest("month must be in YYYY-MM format (e.g. 2025-01).");
  }

  const society = await _getSociety(societyId);

  const bills = await MaintenanceBill
    .find({ society: toOid(societyId), billMonth: month, isPublished: true })
    .sort({ createdAt: 1 })
    .lean();

  // Collect all resident IDs across all bills
  const residentIds = bills.flatMap((b) => b.payments.map((p) => p.resident));
  const nameMap     = await _populateNames([...new Set(residentIds.map(String))]);

  // Enrich each bill
  const enriched = bills.map((b) => {
    const payments = b.payments.map((p) => ({
      ...p,
      residentName: nameMap[p.resident?.toString()]?.name || null,
    }));
    const stats = _paymentStats(payments);
    return { ...b, payments, ...stats };
  });

  // Aggregate stats across all bills
  const allPayments = enriched.flatMap((b) => b.payments);
  const stats       = {
    ..._paymentStats(allPayments),
    billCount: bills.length,
  };

  return { month, bills: enriched, stats, society };
};

// ─── 4. Resident Payment History ─────────────────────────────────────────────

const getHistoryData = async (residentId, societyId, query = {}) => {
  const society  = await _getSociety(societyId);
  const resident = await User.findById(residentId, "name flat wing memberships").lean();
  if (!resident) throw AppError.notFound("Resident not found.");

  // Optional year filter
  const matchYear = query.year ? { billMonth: { $regex: `^${query.year}-` } } : {};

  const bills = await MaintenanceBill
    .find({
      society:     toOid(societyId),
      isPublished: true,
      "payments.resident": toOid(residentId),
      ...matchYear,
    })
    .sort({ billMonth: -1 })
    .lean();

  // Extract only this resident's payment record from each bill
  const records = bills.map((b) => {
    const p = b.payments.find((p) => p.resident?.toString() === residentId.toString());
    if (!p) return null;
    return {
      billId:        b._id,
      billTitle:     b.title,
      billMonth:     b.billMonth,
      dueDate:       b.dueDate,
      ...p,
    };
  }).filter(Boolean);

  // Stats
  const totalBilled   = records.reduce((s, r) => s + (r.totalDue || 0), 0);
  const totalPaid     = records
    .filter((r) => r.status === "paid" || r.status === "waived")
    .reduce((s, r) => s + (r.paidAmount || r.totalDue || 0), 0);
  const outstanding   = totalBilled - totalPaid;
  const paidCount     = records.filter((r) => r.status === "paid" || r.status === "waived").length;
  const totalCount    = records.length;

  // Get flat/wing from membership context
  const membership = resident.memberships?.find((m) => m.society?.toString() === societyId.toString());
  const flat = membership?.flat || resident.flat || "—";
  const wing = membership?.wing || resident.wing || null;

  return {
    resident: { ...resident, flat, wing },
    records,
    stats: { totalBilled, totalPaid, outstanding, paidCount, totalCount },
    society,
  };
};

// ─── 5. Society Financial Summary ─────────────────────────────────────────────

const getSummaryData = async (year, societyId) => {
  const parsedYear = parseInt(year, 10);
  if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
    throw AppError.badRequest("year must be a valid 4-digit year.");
  }

  const society = await _getSociety(societyId);

  // Build all 12 months for the year
  const allMonths = Array.from({ length: 12 }, (_, i) =>
    `${parsedYear}-${String(i + 1).padStart(2, "0")}`
  );

  // Fetch all published bills for this year
  const bills = await MaintenanceBill
    .find({
      society:     toOid(societyId),
      isPublished: true,
      billMonth:   { $regex: `^${parsedYear}-` },
    })
    .lean();

  // Group bills by month
  const byMonth = {};
  for (const m of allMonths) byMonth[m] = [];
  for (const b of bills) {
    if (byMonth[b.billMonth]) byMonth[b.billMonth].push(b);
  }

  // Build per-month stats
  const months = allMonths.map((m) => {
    const monthBills   = byMonth[m];
    const allPayments  = monthBills.flatMap((b) => b.payments);
    const stats        = _paymentStats(allPayments);
    return {
      month:      m,
      billCount:  monthBills.length,
      ...stats,
    };
  });

  // Annual totals
  const totalBilled    = months.reduce((s, m) => s + m.totalBilled, 0);
  const collected      = months.reduce((s, m) => s + m.collected, 0);
  const pending        = months.reduce((s, m) => s + m.pending, 0);
  const billCount      = months.reduce((s, m) => s + m.billCount, 0);
  const totalDefaulters= months.reduce((s, m) => s + m.defaulters, 0);
  const collectionPct  = totalBilled > 0 ? (collected / totalBilled) * 100 : 0;

  return {
    year:   parsedYear,
    months,
    annual: { totalBilled, collected, pending, billCount, totalDefaulters, collectionPct },
    society,
  };
};

module.exports = {
  getBillData,
  getReceiptData,
  getCollectionData,
  getHistoryData,
  getSummaryData,
};

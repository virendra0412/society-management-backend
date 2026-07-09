/**
 * controllers/maintenanceReport.controller.js
 *
 * HTTP handlers for all 5 maintenance reports.
 * Each handler supports two formats via ?format=html (default) or ?format=csv.
 *
 * HTML → Content-Type: text/html  (open in browser → Print → Save as PDF)
 * CSV  → Content-Type: text/csv   (open in Excel / Google Sheets)
 *
 * Routes (mounted at /api/v1/maintenance/reports):
 *
 *   GET /bill/:billId                          → full bill (all flats)
 *   GET /receipt/:billId/:paymentId            → single flat receipt (HTML only)
 *   GET /collection?month=YYYY-MM&format=csv   → monthly collection
 *   GET /history?residentId=xxx&year=2025      → resident payment history
 *   GET /summary?year=2025&format=csv          → society financial summary
 */

const reportService = require("../services/maintenanceReport.service");
const {
  billHtml, receiptHtml, collectionHtml, historyHtml, summaryHtml,
} = require("../utils/reportHtml");
const {
  billCsv, collectionCsv, historyCsv, summaryCsv,
} = require("../utils/reportCsv");
const AppError = require("../utils/AppError");
const { audit } = require("../middlewares/audit.middleware");

// ─── Helper: send HTML or CSV ─────────────────────────────────────────────────

const sendReport = (res, { html, csv, csvFilename, format }) => {
  if (format === "csv") {
    if (!csv) throw AppError.badRequest("CSV export is not available for this report.");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${csvFilename}"`);
    // BOM so Excel on Windows opens UTF-8 CSV correctly (₹ symbol)
    return res.send("\uFEFF" + csv);
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(html);
};

// ─── 1. Maintenance Bill ───────────────────────────────────────────────────────

const billReport = async (req, res) => {
  const data   = await reportService.getBillData(req.params.billId, req.societyId);
  const format = req.query.format || "html";

  await audit(req, "report.bill_generated", "MaintenanceBill", req.params.billId, { format });

  sendReport(res, {
    format,
    html:        billHtml(data),
    csv:         billCsv(data),
    csvFilename: `bill-${data.bill.billMonth || "report"}.csv`,
  });
};

// ─── 2. Payment Receipt ────────────────────────────────────────────────────────

const receiptReport = async (req, res) => {
  const data = await reportService.getReceiptData(
    req.params.billId,
    req.params.paymentId,
    req.societyId
  );

  await audit(req, "report.receipt_generated", "MaintenanceBill", req.params.billId, {
    paymentId: req.params.paymentId,
    flat: data.payment.flat,
  });

  // Receipts are HTML-only — there's no useful CSV format for a single receipt
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(receiptHtml(data));
};

// ─── 3. Monthly Collection Report ─────────────────────────────────────────────

const collectionReport = async (req, res) => {
  const month  = req.query.month;
  if (!month) throw AppError.badRequest("month query param required (YYYY-MM).");

  const data   = await reportService.getCollectionData(month, req.societyId);
  const format = req.query.format || "html";

  await audit(req, "report.collection_generated", "Society", req.societyId, { month, format });

  sendReport(res, {
    format,
    html:        collectionHtml(data),
    csv:         collectionCsv(data),
    csvFilename: `collection-${month}.csv`,
  });
};

// ─── 4. Resident Payment History ─────────────────────────────────────────────

const historyReport = async (req, res) => {
  // Admin can view any resident; resident can only view their own
  let residentId = req.query.residentId;

  if (!req.user.role || req.user.role === "resident") {
    // Force residents to only see their own history
    residentId = req.user._id.toString();
  } else if (!residentId) {
    throw AppError.badRequest("residentId query param required.");
  }

  const data   = await reportService.getHistoryData(residentId, req.societyId, req.query);
  const format = req.query.format || "html";

  await audit(req, "report.history_generated", "User", residentId, { format, year: req.query.year });

  sendReport(res, {
    format,
    html:        historyHtml(data),
    csv:         historyCsv(data),
    csvFilename: `payment-history-${data.resident.flat || residentId}.csv`,
  });
};

// ─── 5. Society Financial Summary ─────────────────────────────────────────────

const summaryReport = async (req, res) => {
  const year   = req.query.year || new Date().getFullYear();
  const data   = await reportService.getSummaryData(year, req.societyId);
  const format = req.query.format || "html";

  await audit(req, "report.summary_generated", "Society", req.societyId, { year, format });

  sendReport(res, {
    format,
    html:        summaryHtml(data),
    csv:         summaryCsv(data),
    csvFilename: `financial-summary-${year}.csv`,
  });
};

module.exports = {
  billReport,
  receiptReport,
  collectionReport,
  historyReport,
  summaryReport,
};

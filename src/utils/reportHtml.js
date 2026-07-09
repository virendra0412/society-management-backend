/**
 * utils/reportHtml.js
 *
 * Generates print-ready, mobile-viewable HTML for all 5 maintenance reports.
 * No external dependencies — pure string generation.
 *
 * Reports:
 *   billHtml(data)         — Maintenance Bill (all flats in one bill)
 *   receiptHtml(data)      — Payment Receipt (single flat)
 *   collectionHtml(data)   — Monthly Collection Report (all bills in a month)
 *   historyHtml(data)      — Resident Payment History
 *   summaryHtml(data)      — Society Financial Summary (year)
 */

// ─── Shared helpers ────────────────────────────────────────────────────────────

const fmtINR = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtMonth = (m) => {
  if (!m) return "—";
  const [y, mo] = m.split("-");
  return new Date(y, parseInt(mo) - 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
};

const statusBadge = (status) => {
  const map = {
    paid:    { bg: "#D1FAE5", color: "#065F46", label: "Paid" },
    unpaid:  { bg: "#FEF3C7", color: "#92400E", label: "Unpaid" },
    overdue: { bg: "#FEE2E2", color: "#991B1B", label: "Overdue" },
    waived:  { bg: "#F3F4F6", color: "#6B7280", label: "Waived" },
    partial: { bg: "#DBEAFE", color: "#1E40AF", label: "Partial" },
  };
  const s = map[status] || { bg: "#F3F4F6", color: "#6B7280", label: status };
  return `<span style="background:${s.bg};color:${s.color};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">${s.label}</span>`;
};

// ─── Shared CSS ────────────────────────────────────────────────────────────────

const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F5F3EE;color:#1A1714;font-size:14px;line-height:1.5}
  .page{background:#fff;max-width:900px;margin:0 auto;padding:40px}
  @media print{body{background:#fff}.page{padding:20px;max-width:100%}.no-print{display:none}}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0F2040;padding-bottom:16px;margin-bottom:24px}
  .society-name{font-size:20px;font-weight:800;color:#0F2040}
  .society-sub{font-size:12px;color:#8C8680;margin-top:2px}
  .report-badge{background:#0F2040;color:#fff;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;white-space:nowrap}
  .report-title{font-size:18px;font-weight:700;color:#0F2040;margin-bottom:4px}
  .report-sub{font-size:12px;color:#8C8680}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th{background:#F5F3EE;padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#8C8680;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #EEECE8}
  td{padding:10px 12px;border-bottom:1px solid #EEECE8;font-size:13px;vertical-align:top}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:#F9F8F6}
  .amount{text-align:right;font-weight:600}
  .summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:20px 0}
  .summary-card{background:#F5F3EE;border-radius:10px;padding:16px}
  .summary-card .label{font-size:11px;color:#8C8680;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
  .summary-card .value{font-size:20px;font-weight:800;color:#0F2040}
  .summary-card .value.green{color:#22835C}
  .summary-card .value.red{color:#E53E3E}
  .summary-card .value.amber{color:#F4A228}
  .section-title{font-size:13px;font-weight:700;color:#8C8680;text-transform:uppercase;letter-spacing:.5px;margin:24px 0 10px}
  .info-row{display:flex;gap:8px;margin-bottom:6px;font-size:13px}
  .info-label{color:#8C8680;min-width:130px}
  .info-value{color:#1A1714;font-weight:600}
  .footer{margin-top:40px;border-top:1px solid #EEECE8;padding-top:16px;font-size:11px;color:#8C8680;display:flex;justify-content:space-between}
  .tfoot-row td{background:#0F2040;color:#fff;font-weight:700;font-size:13px;padding:12px}
  .tfoot-row td.amount{text-align:right}
  .print-btn{display:inline-block;background:#0F2040;color:#fff;padding:10px 20px;border-radius:8px;font-weight:700;cursor:pointer;border:none;font-size:14px;margin-bottom:20px}
  .print-btn:hover{background:#0D7377}
  @media print{.print-btn{display:none}}
`;

// ─── Shared page wrapper ───────────────────────────────────────────────────────

const page = (society, reportBadge, titleBlock, body) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${society.name} — ${reportBadge}</title>
  <style>${BASE_CSS}</style>
</head>
<body>
<div class="page">
  <div class="no-print" style="padding-bottom:16px">
    <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>
  <div class="header">
    <div>
      <div class="society-name">${society.name}</div>
      <div class="society-sub">${[society.address, society.city, society.state].filter(Boolean).join(", ")}</div>
    </div>
    <span class="report-badge">${reportBadge}</span>
  </div>
  <div style="margin-bottom:20px">
    ${titleBlock}
  </div>
  ${body}
  <div class="footer">
    <span>Generated on ${fmtDate(new Date())} at ${new Date().toLocaleTimeString("en-IN")}</span>
    <span>${society.name}</span>
  </div>
</div>
</body>
</html>`;

// ─── 1. Maintenance Bill ───────────────────────────────────────────────────────

/**
 * @param {{ bill, society, stats }} data
 */
const billHtml = ({ bill, society, stats }) => {
  const rows = (bill.payments || []).map((p) => `
    <tr>
      <td>${p.wing ? `${p.wing} - ` : ""}${p.flat}</td>
      <td>${p.residentName || "—"}</td>
      <td class="amount">${fmtINR(p.amount)}</td>
      <td class="amount">${p.penalty > 0 ? `<span style="color:#E53E3E">+${fmtINR(p.penalty)}</span>` : "—"}</td>
      <td class="amount">${p.discount > 0 ? `<span style="color:#22835C">-${fmtINR(p.discount)}</span>` : "—"}</td>
      <td class="amount"><strong>${fmtINR(p.totalDue)}</strong></td>
      <td style="text-align:center">${statusBadge(p.status)}</td>
      <td>${p.paidAt ? fmtDate(p.paidAt) : "—"}</td>
    </tr>`).join("");

  const titleBlock = `
    <div class="report-title">${bill.title}</div>
    <div class="report-sub">Bill month: ${fmtMonth(bill.billMonth)} &nbsp;|&nbsp; Due: ${fmtDate(bill.dueDate)}</div>`;

  const summaryGrid = `
    <div class="summary-grid">
      <div class="summary-card"><div class="label">Total Flats</div><div class="value">${stats.totalFlats}</div></div>
      <div class="summary-card"><div class="label">Total Billed</div><div class="value">${fmtINR(stats.totalBilled)}</div></div>
      <div class="summary-card"><div class="label">Collected</div><div class="value green">${fmtINR(stats.collected)}</div></div>
      <div class="summary-card"><div class="label">Pending</div><div class="value amber">${fmtINR(stats.pending)}</div></div>
      <div class="summary-card"><div class="label">Paid</div><div class="value green">${stats.paidCount}</div></div>
      <div class="summary-card"><div class="label">Unpaid / Overdue</div><div class="value red">${stats.unpaidCount}</div></div>
    </div>`;

  const table = `
    <table>
      <thead><tr>
        <th>Flat</th><th>Resident</th>
        <th class="amount">Base (₹)</th><th class="amount">Penalty (₹)</th>
        <th class="amount">Discount (₹)</th><th class="amount">Total Due (₹)</th>
        <th style="text-align:center">Status</th><th>Paid On</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="tfoot-row">
        <td colspan="5">Total</td>
        <td class="amount">${fmtINR(stats.totalBilled)}</td>
        <td colspan="2"></td>
      </tr></tfoot>
    </table>`;

  return page(society, "Maintenance Bill", titleBlock, summaryGrid + table);
};

// ─── 2. Payment Receipt ────────────────────────────────────────────────────────

/**
 * @param {{ bill, payment, residentName, society }} data
 */
const receiptHtml = ({ bill, payment: p, residentName, society }) => {
  const receiptNo = `RCP-${String(p._id).slice(-8).toUpperCase()}`;

  const titleBlock = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div class="report-title">Payment Receipt</div>
        <div class="report-sub">${bill.title} &nbsp;|&nbsp; ${fmtMonth(bill.billMonth)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:13px;color:#8C8680">Receipt No.</div>
        <div style="font-size:16px;font-weight:800;color:#0F2040">${receiptNo}</div>
      </div>
    </div>`;

  const body = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px">
      <div>
        <div class="section-title">Resident Details</div>
        <div class="info-row"><span class="info-label">Name</span><span class="info-value">${residentName}</span></div>
        <div class="info-row"><span class="info-label">Flat</span><span class="info-value">${p.wing ? `${p.wing} - ` : ""}${p.flat}</span></div>
        <div class="info-row"><span class="info-label">Bill Period</span><span class="info-value">${fmtMonth(bill.billMonth)}</span></div>
      </div>
      <div>
        <div class="section-title">Payment Details</div>
        <div class="info-row"><span class="info-label">Date Paid</span><span class="info-value">${fmtDate(p.paidAt)}</span></div>
        <div class="info-row"><span class="info-label">Method</span><span class="info-value">${(p.paymentMethod || "—").toUpperCase()}</span></div>
        ${p.transactionId ? `<div class="info-row"><span class="info-label">Reference</span><span class="info-value">${p.transactionId}</span></div>` : ""}
        ${p.verifiedBy ? `<div class="info-row"><span class="info-label">Verified by</span><span class="info-value">${p.verifiedByName || "Admin"}</span></div>` : ""}
      </div>
    </div>

    <div style="background:#F5F3EE;border-radius:12px;padding:20px;max-width:360px;margin:0 auto">
      <div class="section-title" style="margin-top:0">Amount Breakdown</div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #EEECE8">
        <span style="color:#8C8680">Base Amount</span><span>${fmtINR(p.amount)}</span>
      </div>
      ${p.penalty > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #EEECE8"><span style="color:#8C8680">Late Penalty</span><span style="color:#E53E3E">+ ${fmtINR(p.penalty)}</span></div>` : ""}
      ${p.discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #EEECE8"><span style="color:#8C8680">Discount</span><span style="color:#22835C">- ${fmtINR(p.discount)}</span></div>` : ""}
      <div style="display:flex;justify-content:space-between;padding:12px 0;margin-top:4px;border-top:2px solid #0F2040">
        <strong style="font-size:15px">Amount Paid</strong>
        <strong style="font-size:18px;color:#22835C">${fmtINR(p.paidAmount || p.totalDue)}</strong>
      </div>
    </div>

    ${p.receiptNote ? `<div style="margin-top:16px;padding:12px;background:#FEF3C7;border-radius:8px;font-size:13px"><strong>Note:</strong> ${p.receiptNote}</div>` : ""}

    <div style="margin-top:32px;text-align:center;border:1px dashed #C4BFB5;border-radius:8px;padding:16px;color:#8C8680;font-size:12px">
      This is a computer-generated receipt. No signature required.
    </div>`;

  return page(society, "Receipt", titleBlock, body);
};

// ─── 3. Monthly Collection Report ─────────────────────────────────────────────

/**
 * @param {{ month, bills, stats, society }} data
 */
const collectionHtml = ({ month, bills, stats, society }) => {
  const billRows = bills.map((b) => `
    <tr>
      <td>${b.title}</td>
      <td>${fmtDate(b.dueDate)}</td>
      <td style="text-align:center">${b.totalFlats}</td>
      <td class="amount">${fmtINR(b.totalBilled)}</td>
      <td class="amount" style="color:#22835C">${fmtINR(b.collected)}</td>
      <td class="amount" style="color:#E53E3E">${fmtINR(b.pending)}</td>
      <td style="text-align:center">
        <div style="background:#EEECE8;border-radius:4px;height:8px;width:80px;display:inline-block;vertical-align:middle">
          <div style="background:#22835C;height:8px;border-radius:4px;width:${Math.round(b.collectionPct)}%"></div>
        </div>
        <span style="margin-left:6px;font-size:12px;color:#8C8680">${Math.round(b.collectionPct)}%</span>
      </td>
    </tr>`).join("");

  // Flat-level breakdown
  const flatRows = bills.flatMap((b) =>
    (b.payments || []).map((p) => `
      <tr>
        <td>${p.wing ? `${p.wing} - ` : ""}${p.flat}</td>
        <td>${p.residentName || "—"}</td>
        <td>${b.title}</td>
        <td class="amount">${fmtINR(p.totalDue)}</td>
        <td class="amount">${p.status === "paid" ? fmtINR(p.paidAmount || p.totalDue) : "—"}</td>
        <td style="text-align:center">${statusBadge(p.status)}</td>
        <td>${p.paidAt ? fmtDate(p.paidAt) : "—"}</td>
        <td>${p.paymentMethod ? p.paymentMethod.toUpperCase() : "—"}</td>
      </tr>`)
  ).join("");

  const titleBlock = `
    <div class="report-title">Monthly Collection Report</div>
    <div class="report-sub">${fmtMonth(month)}</div>`;

  const summaryGrid = `
    <div class="summary-grid">
      <div class="summary-card"><div class="label">Bills This Month</div><div class="value">${stats.billCount}</div></div>
      <div class="summary-card"><div class="label">Total Billed</div><div class="value">${fmtINR(stats.totalBilled)}</div></div>
      <div class="summary-card"><div class="label">Collected</div><div class="value green">${fmtINR(stats.collected)}</div></div>
      <div class="summary-card"><div class="label">Pending</div><div class="value amber">${fmtINR(stats.pending)}</div></div>
      <div class="summary-card"><div class="label">Collection %</div><div class="value ${stats.collectionPct >= 80 ? "green" : "amber"}">${Math.round(stats.collectionPct)}%</div></div>
      <div class="summary-card"><div class="label">Defaulters</div><div class="value red">${stats.defaulters}</div></div>
    </div>`;

  const billsTable = bills.length === 0 ? "<p style='color:#8C8680'>No bills for this month.</p>" : `
    <div class="section-title">Bills Summary</div>
    <table>
      <thead><tr>
        <th>Bill</th><th>Due Date</th><th style="text-align:center">Flats</th>
        <th class="amount">Billed</th><th class="amount">Collected</th>
        <th class="amount">Pending</th><th style="text-align:center">Collection</th>
      </tr></thead>
      <tbody>${billRows}</tbody>
    </table>`;

  const flatTable = `
    <div class="section-title" style="margin-top:32px">Flat-wise Breakdown</div>
    <table>
      <thead><tr>
        <th>Flat</th><th>Resident</th><th>Bill</th>
        <th class="amount">Due</th><th class="amount">Paid</th>
        <th style="text-align:center">Status</th><th>Paid On</th><th>Method</th>
      </tr></thead>
      <tbody>${flatRows}</tbody>
    </table>`;

  return page(society, "Collection Report", titleBlock, summaryGrid + billsTable + flatTable);
};

// ─── 4. Resident Payment History ──────────────────────────────────────────────

/**
 * @param {{ resident, records, stats, society }} data
 */
const historyHtml = ({ resident, records, stats, society }) => {
  const rows = records.map((r) => `
    <tr>
      <td>${fmtMonth(r.billMonth)}</td>
      <td>${r.billTitle}</td>
      <td class="amount">${fmtINR(r.amount)}</td>
      <td class="amount">${r.penalty > 0 ? `<span style="color:#E53E3E">+${fmtINR(r.penalty)}</span>` : "—"}</td>
      <td class="amount">${r.discount > 0 ? `<span style="color:#22835C">-${fmtINR(r.discount)}</span>` : "—"}</td>
      <td class="amount"><strong>${fmtINR(r.totalDue)}</strong></td>
      <td style="text-align:center">${statusBadge(r.status)}</td>
      <td>${r.paidAt ? fmtDate(r.paidAt) : "—"}</td>
      <td>${r.paymentMethod ? r.paymentMethod.toUpperCase() : "—"}</td>
      <td>${r.transactionId || "—"}</td>
    </tr>`).join("");

  const titleBlock = `
    <div class="report-title">Resident Payment History</div>
    <div class="report-sub">
      ${resident.name} &nbsp;|&nbsp; Flat ${resident.wing ? `${resident.wing} - ` : ""}${resident.flat}
    </div>`;

  const summaryGrid = `
    <div class="summary-grid">
      <div class="summary-card"><div class="label">Total Billed</div><div class="value">${fmtINR(stats.totalBilled)}</div></div>
      <div class="summary-card"><div class="label">Total Paid</div><div class="value green">${fmtINR(stats.totalPaid)}</div></div>
      <div class="summary-card"><div class="label">Outstanding</div><div class="value ${stats.outstanding > 0 ? "red" : "green"}">${fmtINR(stats.outstanding)}</div></div>
      <div class="summary-card"><div class="label">Bills Paid</div><div class="value">${stats.paidCount} / ${stats.totalCount}</div></div>
    </div>`;

  const table = records.length === 0 ? "<p style='color:#8C8680'>No payment records found.</p>" : `
    <table>
      <thead><tr>
        <th>Period</th><th>Bill</th>
        <th class="amount">Base</th><th class="amount">Penalty</th><th class="amount">Discount</th>
        <th class="amount">Total Due</th><th style="text-align:center">Status</th>
        <th>Paid On</th><th>Method</th><th>Reference</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  return page(society, "Payment History", titleBlock, summaryGrid + table);
};

// ─── 5. Society Financial Summary ─────────────────────────────────────────────

/**
 * @param {{ year, months, annual, society }} data
 */
const summaryHtml = ({ year, months, annual, society }) => {
  const rows = months.map((m) => `
    <tr>
      <td><strong>${fmtMonth(m.month)}</strong></td>
      <td style="text-align:center">${m.billCount}</td>
      <td class="amount">${fmtINR(m.totalBilled)}</td>
      <td class="amount" style="color:#22835C">${fmtINR(m.collected)}</td>
      <td class="amount" style="color:#E53E3E">${fmtINR(m.pending)}</td>
      <td style="text-align:center">${m.defaulters}</td>
      <td style="text-align:center">
        <div style="background:#EEECE8;border-radius:4px;height:8px;width:80px;display:inline-block;vertical-align:middle">
          <div style="background:${m.collectionPct >= 80 ? "#22835C" : m.collectionPct >= 50 ? "#F4A228" : "#E53E3E"};height:8px;border-radius:4px;width:${Math.round(m.collectionPct)}%"></div>
        </div>
        <span style="margin-left:6px;font-size:12px;color:#8C8680">${Math.round(m.collectionPct)}%</span>
      </td>
    </tr>`).join("");

  const titleBlock = `
    <div class="report-title">Society Financial Summary</div>
    <div class="report-sub">Year ${year} &nbsp;|&nbsp; ${society.name}</div>`;

  const summaryGrid = `
    <div class="summary-grid">
      <div class="summary-card"><div class="label">Annual Billed</div><div class="value">${fmtINR(annual.totalBilled)}</div></div>
      <div class="summary-card"><div class="label">Annual Collected</div><div class="value green">${fmtINR(annual.collected)}</div></div>
      <div class="summary-card"><div class="label">Annual Pending</div><div class="value red">${fmtINR(annual.pending)}</div></div>
      <div class="summary-card"><div class="label">Avg. Collection %</div><div class="value ${annual.collectionPct >= 80 ? "green" : "amber"}">${Math.round(annual.collectionPct)}%</div></div>
      <div class="summary-card"><div class="label">Total Bills</div><div class="value">${annual.billCount}</div></div>
      <div class="summary-card"><div class="label">Active Months</div><div class="value">${months.filter(m => m.billCount > 0).length}</div></div>
    </div>`;

  const table = `
    <div class="section-title">Month-by-Month Breakdown</div>
    <table>
      <thead><tr>
        <th>Month</th><th style="text-align:center">Bills</th>
        <th class="amount">Billed</th><th class="amount">Collected</th>
        <th class="amount">Pending</th><th style="text-align:center">Defaulters</th>
        <th style="text-align:center">Collection %</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="tfoot-row">
        <td><strong>Annual Total</strong></td>
        <td style="text-align:center">${annual.billCount}</td>
        <td class="amount">${fmtINR(annual.totalBilled)}</td>
        <td class="amount">${fmtINR(annual.collected)}</td>
        <td class="amount">${fmtINR(annual.pending)}</td>
        <td style="text-align:center">${annual.totalDefaulters}</td>
        <td style="text-align:center">${Math.round(annual.collectionPct)}%</td>
      </tr></tfoot>
    </table>`;

  return page(society, "Financial Summary", titleBlock, summaryGrid + table);
};

module.exports = { billHtml, receiptHtml, collectionHtml, historyHtml, summaryHtml };

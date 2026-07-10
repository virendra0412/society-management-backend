/**
 * utils/reportCsv.js
 *
 * Generates CSV strings for Excel export.
 * No dependencies — opens natively in Excel, Google Sheets, LibreOffice Calc.
 *
 * Functions:
 *   billCsv(data)        — bill flat-level payment records
 *   collectionCsv(data)  — monthly collection (flat-level)
 *   historyCsv(data)     — resident payment history
 *   summaryCsv(data)     — society financial summary (monthly)
 */

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

const fmtMonth = (m) => {
  if (!m) return "";
  const [y, mo] = m.split("-");
  return new Date(y, parseInt(mo) - 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
};

// Escape a CSV cell: wrap in quotes if it contains comma/quote/newline
const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const row = (...cells) => cells.map(cell).join(",") + "\r\n";

// ─── 1. Bill CSV ───────────────────────────────────────────────────────────────

const billCsv = ({ bill, society, stats }) => {
  let out = "";
  out += row(society.name);
  out += row("Maintenance Bill:", bill.title);
  out += row("Bill Month:", fmtMonth(bill.billMonth));
  out += row("Due Date:", fmtDate(bill.dueDate));
  out += row("Generated On:", fmtDate(new Date()));
  out += "\r\n";

  out += row("Summary");
  out += row("Total Flats", stats.totalFlats);
  out += row("Total Billed (₹)", stats.totalBilled);
  out += row("Collected (₹)", stats.collected);
  out += row("Pending (₹)", stats.pending);
  out += row("Paid", stats.paidCount);
  out += row("Unpaid / Overdue", stats.unpaidCount);
  out += "\r\n";

  out += row("Wing/Flat", "Resident", "Base Amount (₹)", "Penalty (₹)",
    "Discount (₹)", "Total Due (₹)", "Status", "Paid On", "Method", "Reference");

  for (const p of (bill.payments || [])) {
    out += row(
      `${p.wing ? p.wing + " - " : ""}${p.flat}`,
      p.residentName || "",
      p.amount,
      p.penalty || 0,
      p.discount || 0,
      p.totalDue,
      p.status,
      fmtDate(p.paidAt),
      p.paymentMethod || "",
      p.transactionId || ""
    );
  }
  return out;
};

// ─── 2. Collection CSV ────────────────────────────────────────────────────────

const collectionCsv = ({ month, bills, stats, society }) => {
  const fmtM = fmtMonth(month);
  let out = "";
  out += row(society.name);
  out += row("Monthly Collection Report:", fmtM);
  out += row("Generated On:", fmtDate(new Date()));
  out += "\r\n";

  out += row("Summary");
  out += row("Bills Count", stats.billCount);
  out += row("Total Billed (₹)", stats.totalBilled);
  out += row("Collected (₹)", stats.collected);
  out += row("Pending (₹)", stats.pending);
  out += row("Collection %", Math.round(stats.collectionPct) + "%");
  out += row("Defaulters", stats.defaulters);
  out += "\r\n";

  out += row("Wing/Flat", "Resident", "Bill", "Total Due (₹)",
    "Amount Paid (₹)", "Status", "Paid On", "Method", "Reference");

  for (const b of bills) {
    for (const p of (b.payments || [])) {
      out += row(
        `${p.wing ? p.wing + " - " : ""}${p.flat}`,
        p.residentName || "",
        b.title,
        p.totalDue,
        p.status === "paid" ? (p.paidAmount || p.totalDue) : "",
        p.status,
        fmtDate(p.paidAt),
        p.paymentMethod || "",
        p.transactionId || ""
      );
    }
  }
  return out;
};

// ─── 3. History CSV ───────────────────────────────────────────────────────────

const historyCsv = ({ resident, records, stats, society }) => {
  let out = "";
  out += row(society.name);
  out += row("Resident Payment History");
  out += row("Resident:", resident.name);
  out += row("Flat:", `${resident.wing ? resident.wing + " - " : ""}${resident.flat}`);
  out += row("Generated On:", fmtDate(new Date()));
  out += "\r\n";

  out += row("Summary");
  out += row("Total Billed (₹)", stats.totalBilled);
  out += row("Total Paid (₹)", stats.totalPaid);
  out += row("Outstanding (₹)", stats.outstanding);
  out += row("Bills Paid", `${stats.paidCount} / ${stats.totalCount}`);
  out += "\r\n";

  out += row("Period", "Bill", "Base (₹)", "Penalty (₹)", "Discount (₹)",
    "Total Due (₹)", "Status", "Paid On", "Method", "Reference");

  for (const r of records) {
    out += row(
      fmtMonth(r.billMonth),
      r.billTitle,
      r.amount,
      r.penalty || 0,
      r.discount || 0,
      r.totalDue,
      r.status,
      fmtDate(r.paidAt),
      r.paymentMethod || "",
      r.transactionId || ""
    );
  }
  return out;
};

// ─── 4. Summary CSV ───────────────────────────────────────────────────────────

const summaryCsv = ({ year, months, annual, society }) => {
  let out = "";
  out += row(society.name);
  out += row("Society Financial Summary", `Year ${year}`);
  out += row("Generated On:", fmtDate(new Date()));
  out += "\r\n";

  out += row("Annual Summary");
  out += row("Total Billed (₹)", annual.totalBilled);
  out += row("Total Collected (₹)", annual.collected);
  out += row("Total Pending (₹)", annual.pending);
  out += row("Avg. Collection %", Math.round(annual.collectionPct) + "%");
  out += row("Total Bills", annual.billCount);
  out += "\r\n";

  out += row("Month", "Bills", "Billed (₹)", "Collected (₹)",
    "Pending (₹)", "Defaulters", "Collection %");

  for (const m of months) {
    out += row(
      fmtMonth(m.month),
      m.billCount,
      m.totalBilled,
      m.collected,
      m.pending,
      m.defaulters,
      Math.round(m.collectionPct) + "%"
    );
  }

  // Total row
  out += row(
    "TOTAL",
    annual.billCount,
    annual.totalBilled,
    annual.collected,
    annual.pending,
    annual.totalDefaulters,
    Math.round(annual.collectionPct) + "%"
  );
  return out;
};

module.exports = { billCsv, collectionCsv, historyCsv, summaryCsv };

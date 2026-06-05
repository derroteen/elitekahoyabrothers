import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtKES, fmtDate } from "@/lib/format";

const CATEGORY_LABELS: Record<string, string> = {
  weekly_collection: "Weekly Collection",
  bonus: "Bonus Allocation",
  withdrawal: "Withdrawal",
  brought_forward: "Brought Forward Balance",
  adjustment: "Adjustment Entry",
  refund: "Refund",
  special_contribution: "Special Contribution",
  dividend: "Dividend Payment",
  savings: "Savings",
  other: "Other",
};

function descriptionFor(e: any): string {
  if (e.__brought_forward) return "Brought Forward Balance";
  if (e.description) return e.description;
  if (e.category && CATEGORY_LABELS[e.category]) return CATEGORY_LABELS[e.category];
  if (e.remarks) return e.remarks;
  return "Entry";
}

export interface PassbookExportMeta {
  memberName?: string;
  membershipNo?: string;
}

function safeName(s?: string) {
  return (s ?? "passbook").replace(/[^a-z0-9_-]+/gi, "_");
}

function buildRows(entries: any[]) {
  return entries.map((e) => {
    const credit = Number(e.savings ?? 0) + Number(e.bonus ?? 0);
    const debit = Number(e.withdrawal ?? 0);
    const source = e.__brought_forward ? "Opening" : e.source === "weekly" ? "Weekly Sheet" : "Manual";
    return {
      Date: fmtDate(e.entry_date),
      Description: descriptionFor(e),
      Credit: credit,
      Debit: debit,
      Balance: Number(e.balance ?? 0),
      "Loan Pmt": Number(e.loan_payment ?? 0),
      "Loan Bal": Number(e.loan_balance ?? 0),
      Source: source,
    };
  });
}

export function exportPassbookExcel(entries: any[], meta: PassbookExportMeta) {
  const rows = buildRows(entries);
  const totalCredit = rows.reduce((s, r) => s + r.Credit, 0);
  const totalDebit = rows.reduce((s, r) => s + r.Debit, 0);
  const currentBal = entries.at(-1)?.balance ?? 0;
  const loanBal = entries.at(-1)?.loan_balance ?? 0;

  const header = [
    ["Elite Kahoya Brothers — Passbook Statement"],
    [`Member: ${meta.memberName ?? "—"}`, `Membership No: ${meta.membershipNo ?? "—"}`],
    [`Generated: ${new Date().toLocaleString()}`],
    [],
  ];

  const ws = XLSX.utils.aoa_to_sheet(header);
  XLSX.utils.sheet_add_json(ws, rows, { origin: -1 });

  const lastRow = header.length + rows.length + 1;
  XLSX.utils.sheet_add_aoa(
    ws,
    [
      [],
      ["", "Totals", totalCredit, totalDebit, currentBal, "", loanBal, ""],
    ],
    { origin: `A${lastRow + 1}` },
  );

  ws["!cols"] = [
    { wch: 12 }, { wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Passbook");
  XLSX.writeFile(wb, `${safeName(meta.membershipNo || meta.memberName)}_passbook.xlsx`);
}

export function exportPassbookPdf(entries: any[], meta: PassbookExportMeta) {
  const rows = buildRows(entries);
  const totalCredit = rows.reduce((s, r) => s + r.Credit, 0);
  const totalDebit = rows.reduce((s, r) => s + r.Debit, 0);
  const currentBal = entries.at(-1)?.balance ?? 0;
  const loanBal = entries.at(-1)?.loan_balance ?? 0;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Elite Kahoya Brothers — Passbook Statement", 40, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Member: ${meta.memberName ?? "—"}`, 40, 58);
  doc.text(`Membership No: ${meta.membershipNo ?? "—"}`, 300, 58);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 72);
  doc.text(`Current Balance: ${fmtKES(currentBal)}    Loan Balance: ${fmtKES(loanBal)}`, 40, 86);

  autoTable(doc, {
    startY: 100,
    head: [["Date", "Description", "Credit", "Debit", "Balance", "Loan Pmt", "Loan Bal", "Source"]],
    body: rows.map((r) => [
      r.Date,
      r.Description,
      r.Credit ? r.Credit.toFixed(2) : "",
      r.Debit ? r.Debit.toFixed(2) : "",
      r.Balance.toFixed(2),
      r["Loan Pmt"] ? r["Loan Pmt"].toFixed(2) : "",
      r["Loan Bal"] ? r["Loan Bal"].toFixed(2) : "",
      r.Source,
    ]),
    foot: [[
      "", "Totals",
      totalCredit.toFixed(2),
      totalDebit.toFixed(2),
      Number(currentBal).toFixed(2),
      "", Number(loanBal).toFixed(2), "",
    ]],
    styles: { font: "helvetica", fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    footStyles: { fillColor: [241, 245, 249], textColor: 15, fontStyle: "bold" },
    columnStyles: {
      2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" },
      5: { halign: "right" }, 6: { halign: "right" },
    },
  });

  doc.save(`${safeName(meta.membershipNo || meta.memberName)}_passbook.pdf`);
}

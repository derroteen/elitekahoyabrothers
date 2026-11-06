import { Fragment } from "react";
import { fmtKES, fmtDate } from "@/lib/format";
import { Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, FileSpreadsheet, FileText } from "lucide-react";
import { exportPassbookExcel, exportPassbookPdf } from "@/lib/passbook-export";
import { TableRowsSkeleton } from "@/components/loading-skeletons";
import { buildPassbookLoanDisplay, type PassbookLoanRepayment } from "@/lib/passbook-loan-display";

type MemberLoanColumn = {
  id: string;
  type: "loan" | "opening";
  label: string;
  total_repayable: number;
  passbook_opening_balance?: number | null;
  sort_date?: string | null;
  repayments?: PassbookLoanRepayment[];
};

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
  loan_payment: "Loan Repayment",
  insurance_payment: "Insurance Payment",
  fine_payment: "Fine Payment",
  other: "Other",
};

function descriptionFor(e: any): string {
  if ((e as any).__brought_forward) return e.description ?? "Brought Forward Balance";
  if (e.description) return e.description;
  if (e.category && CATEGORY_LABELS[e.category]) return CATEGORY_LABELS[e.category];
  if (e.remarks) return e.remarks;
  return "Entry";
}

export function PassbookTable({ entries, loading, memberName, membershipNo, memberLoans, displayLoans, canEdit, canDelete, onEdit, onDelete }: { entries: any[]; loading?: boolean; memberName?: string; membershipNo?: string; memberLoans?: MemberLoanColumn[]; displayLoans?: MemberLoanColumn[]; canEdit?: boolean; canDelete?: boolean; onEdit?: (entry: any) => void; onDelete?: (entry: any) => void }) {
  const totalSavings = entries.reduce((s, e) => s + Number(e.total ?? 0), 0);
  const totalWithdrawn = entries.reduce((s, e) => s + Number(e.withdrawal ?? 0), 0);
  const currentBal = entries.at(-1)?.balance ?? 0;
  const loanBal = entries.at(-1)?.loan_balance ?? 0;
  const loanDisplay = buildPassbookLoanDisplay(entries, displayLoans ?? memberLoans ?? []);
  const showSplitLoanColumns = loanDisplay !== null;
  const trailingFooterColSpan = (showSplitLoanColumns ? 5 : 2) + 1 + (canEdit ? 1 : 0);
  const tableColSpan = 5 + trailingFooterColSpan;

  const hasEntries = entries.length > 0;
  const doExcel = () => exportPassbookExcel(entries, { memberName, membershipNo }, loanDisplay);
  const doPdf = () => exportPassbookPdf(entries, { memberName, membershipNo }, loanDisplay);

  return (
    <Card className="overflow-hidden relative">
      <div className="bg-navy text-white px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-serif text-lg text-gold">{memberName ?? "Member"}</div>
          <div className="text-xs text-white/60 font-mono uppercase tracking-wider">{membershipNo}</div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-right text-xs text-white/60">
            <div>Balance: <span className="text-gold font-mono">{fmtKES(currentBal)}</span></div>
            <div>Loan: <span className="text-gold font-mono">{fmtKES(loanBal)}</span></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={doExcel} disabled={!hasEntries} className="h-8">
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Excel
            </Button>
            <Button size="sm" variant="secondary" onClick={doPdf} disabled={!hasEntries} className="h-8">
              <FileText className="h-3.5 w-3.5 mr-1" /> PDF
            </Button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-right">Credit</th>
              <th className="px-3 py-2 text-right">Debit</th>
              <th className="px-3 py-2 text-right">Balance</th>
              {showSplitLoanColumns ? (
                <>
                  <th className="px-3 py-2 text-right">Loan 1 Pmt</th>
                  <th className="px-3 py-2 text-right">Loan 1 Bal</th>
                  <th className="px-3 py-2 text-right">Loan 2 Pmt</th>
                  <th className="px-3 py-2 text-right">Loan 2 Bal</th>
                  <th className="px-3 py-2 text-right">Total Loan Bal</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2 text-right">Loan Pmt</th>
                  <th className="px-3 py-2 text-right">Loan Bal</th>
                </>
              )}
              <th className="px-3 py-2 text-left">Source</th>
              {canEdit && <th className="px-3 py-2 text-left">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <TableRowsSkeleton cols={tableColSpan} />}
            {!loading && entries.length === 0 && <tr><td colSpan={tableColSpan} className="p-6 text-center text-muted-foreground">No entries yet</td></tr>}
            {entries.map((e, rowIndex) => {
              const bf = (e as any).__brought_forward;
              const credit = Number(e.savings ?? 0) + Number(e.bonus ?? 0);
              const debit = Number(e.withdrawal ?? 0);
              const isWeekly = e.source === "weekly";
              return (
                <tr key={e.id} className={`border-t border-border ${bf ? "bg-gold/10 font-semibold" : "hover:bg-muted/30"}`}>
                  <td className="px-3 py-2 text-left">{fmtDate(e.entry_date)}</td>
                  <td className="px-3 py-2 text-left text-xs">
                    <div className="font-sans">{descriptionFor(e)}</div>
                    {e.remarks && e.remarks !== e.description && !bf && (
                      <div className="text-[10px] text-muted-foreground font-sans">{e.remarks}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-700">{credit > 0 ? credit.toFixed(2) : ""}</td>
                  <td className="px-3 py-2 text-right text-red-700">{debit > 0 ? debit.toFixed(2) : ""}</td>
                  <td className="px-3 py-2 text-right text-navy font-bold">{Number(e.balance).toFixed(2)}</td>
                  {showSplitLoanColumns ? (
                    <>
                      {[0, 1].map((loanIndex) => {
                        const payment = loanDisplay.rows[rowIndex]?.payments[loanIndex];
                        const balance = loanDisplay.rows[rowIndex]?.balances[loanIndex];
                        return (
                          <Fragment key={loanIndex}>
                            <td className="px-3 py-2 text-right">
                              {payment == null ? "" : payment.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {balance == null ? "" : (
                                <>
                                  {balance.amount.toFixed(2)}
                                  {balance.cleared && <span className="ml-1 text-emerald-700 font-sans text-[10px]">CLEARED</span>}
                                </>
                              )}
                            </td>
                          </Fragment>
                        );
                      })}
                      <td className="px-3 py-2 text-right">{Number(e.loan_balance ?? 0).toFixed(2)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right">{Number(e.loan_payment ?? 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{Number(e.loan_balance ?? 0).toFixed(2)}</td>
                    </>
                  )}
                  <td className="px-3 py-2 text-left text-[10px] uppercase tracking-wider">
                    {bf ? <span className="text-gold-3 font-semibold">Opening</span> : isWeekly ? <span className="text-navy">Weekly Sheet</span> : <span className="text-muted-foreground">Manual</span>}
                  </td>
                  {canEdit && !bf && (
                    <td className="px-3 py-2 text-left whitespace-nowrap">
                      <button onClick={() => onEdit?.(e)} className="text-blue-600 hover:text-blue-800 mr-2" title="Edit"><Pencil className="h-4 w-4 inline" /></button>
                      {canDelete && (
                        <button onClick={() => onDelete?.(e)} className="text-red-600 hover:text-red-800" title="Delete"><Trash2 className="h-4 w-4 inline" /></button>
                      )}
                    </td>
                  )}
                  {canEdit && bf && <td className="px-3 py-2" />}
                </tr>
              );
            })}
          </tbody>
          {entries.length > 0 && (
            <tfoot>
              <tr className="bg-muted/60 font-semibold">
                <td className="px-3 py-2" colSpan={2}>Totals</td>
                <td className="px-3 py-2 text-right text-emerald-700">{fmtKES(totalSavings)}</td>
                <td className="px-3 py-2 text-right text-red-700">{fmtKES(totalWithdrawn)}</td>
                <td className="px-3 py-2 text-right text-navy">{fmtKES(currentBal)}</td>
                <td colSpan={trailingFooterColSpan}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}

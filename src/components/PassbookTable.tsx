import { fmtKES, fmtDate } from "@/lib/format";
import { Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

export function PassbookTable({ entries, loading, memberName, membershipNo, canEdit, onEdit }: { entries: any[]; loading?: boolean; memberName?: string; membershipNo?: string; canEdit?: boolean; onEdit?: (entry: any) => void }) {
  const totalSavings = entries.reduce((s, e) => s + Number(e.total ?? 0), 0);
  const totalWithdrawn = entries.reduce((s, e) => s + Number(e.withdrawal ?? 0), 0);
  const currentBal = entries.at(-1)?.balance ?? 0;
  const loanBal = entries.at(-1)?.loan_balance ?? 0;

  return (
    <Card className="overflow-hidden">
      <div className="bg-navy text-white px-5 py-4 flex items-center justify-between">
        <div>
          <div className="font-serif text-lg text-gold">{memberName ?? "Member"}</div>
          <div className="text-xs text-white/60 font-mono uppercase tracking-wider">{membershipNo}</div>
        </div>
        <div className="text-right text-xs text-white/60">
          <div>Balance: <span className="text-gold font-mono">{fmtKES(currentBal)}</span></div>
          <div>Loan: <span className="text-gold font-mono">{fmtKES(loanBal)}</span></div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-right">Savings</th>
              <th className="px-3 py-2 text-right">Bonus</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Withdrawal</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2 text-right">Loan Pmt</th>
              <th className="px-3 py-2 text-right">Loan Bal</th>
              <th className="px-3 py-2 text-left">Remarks</th>
              <th className="px-3 py-2 text-left">Sign</th>
              {canEdit && <th className="px-3 py-2 text-left">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={canEdit ? 11 : 10} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!loading && entries.length === 0 && <tr><td colSpan={canEdit ? 11 : 10} className="p-6 text-center text-muted-foreground">No entries yet</td></tr>}
            {entries.map((e) => {
              const bf = (e as any).__brought_forward;
              return (
                <tr key={e.id} className={`border-t border-border ${bf ? "bg-gold/10 font-semibold" : "hover:bg-muted/30"}`}>
                  <td className="px-3 py-2 text-left">{fmtDate(e.entry_date)}</td>
                  <td className="px-3 py-2 text-right">{Number(e.savings).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(e.bonus).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-medium">{Number(e.total).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-red-700">{Number(e.withdrawal).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-navy font-bold">{Number(e.balance).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(e.loan_payment).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(e.loan_balance).toFixed(2)}</td>
                  <td className="px-3 py-2 text-left text-xs text-muted-foreground">
                    {bf ? <span className="text-gold-3 font-semibold uppercase tracking-wider text-[10px]">Brought Forward Balance</span> : (e.remarks ?? "")}
                  </td>
                  <td className="px-3 py-2 text-left text-xs">{e.treasurer_sign ?? ""}</td>
                  {canEdit && (
                    <td className="px-3 py-2 text-left">
                      {!bf && (
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onEdit?.(e)}>
                          <Pencil className="h-3 w-3 mr-1" /> Edit
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {entries.length > 0 && (
            <tfoot>
              <tr className="bg-muted/60 font-semibold">
                <td className="px-3 py-2">Totals</td>
                <td colSpan={2}></td>
                <td className="px-3 py-2 text-right">{fmtKES(totalSavings)}</td>
                <td className="px-3 py-2 text-right text-red-700">{fmtKES(totalWithdrawn)}</td>
                <td className="px-3 py-2 text-right text-navy">{fmtKES(currentBal)}</td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}

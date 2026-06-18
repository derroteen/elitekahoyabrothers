import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { fmtKES, fmtDate } from "@/lib/format";
import { calculateOutstandingBalanceFromData } from "@/lib/loan-balance";

export const Route = createFileRoute("/_authenticated/my-loans")({
  component: MyLoans,
  head: () => ({ meta: [{ title: "My Loans — EKB" }] }),
});

function MyLoans() {
  const { user } = useAuth();
  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["my-loans", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [real, opening, repayments] = await Promise.all([
        supabase.from("loans").select("*").eq("member_id", user!.id).order("created_at", { ascending: false }),
        (supabase as any).from("loan_opening_balances").select("*").eq("member_id", user!.id).order("loan_date", { ascending: false }),
        (supabase as any).from("loan_repayments").select("loan_id, opening_loan_id, amount"),
      ]);
      
      const repaymentsByLoan = new Map<string, any[]>();
      const repaymentsByOpeningLoan = new Map<string, any[]>();
      for (const r of repayments.data ?? []) {
        const row = r as any;
        if (row.opening_loan_id) {
          const list = repaymentsByOpeningLoan.get(row.opening_loan_id) ?? [];
          list.push(row);
          repaymentsByOpeningLoan.set(row.opening_loan_id, list);
        } else if (row.loan_id) {
          const list = repaymentsByLoan.get(row.loan_id) ?? [];
          list.push(row);
          repaymentsByLoan.set(row.loan_id, list);
        }
      }

      const openingRows = (opening.data ?? []).map((o: any) => {
        return {
          id: `opening-${o.id}`,
          __opening: true,
          openingId: o.id,
          loan_date: o.loan_date,
          amount_borrowed: o.total_repayable,
          amount_paid: o.amount_paid,
          balance: o.balance,
          outstanding_fines: 0,
          status: o.balance > 0 ? "opening b/f" : "cleared",
        };
      });
      
      const realRows = (real.data ?? []).map((l: any) => {
        const loanRepayments = repaymentsByLoan.get(l.id) ?? [];
        return {
          ...l,
          balance: calculateOutstandingBalanceFromData(l, loanRepayments),
          amount_paid: loanRepayments.reduce((sum, r) => sum + Number(r.amount ?? 0), 0),
        };
      });

      return [...openingRows, ...realRows];
    },
  });

  return (
    <div>
      <PageHeader title="My Loans" subtitle="Loans you've taken with the SACCO" />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Borrowed</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-right">Outstanding Fines</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && loans.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No loans yet</td></tr>}
              {loans.map((l: any) => (
                <tr key={l.id} className={`border-b border-border last:border-0 ${l.__opening ? "bg-amber-50/40" : ""}`}>
                  <td className="px-4 py-3">{fmtDate(l.loan_date)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtKES(l.amount_borrowed)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtKES(l.amount_paid)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-navy">{fmtKES(l.balance)}</td>
                  <td className={`px-4 py-3 text-right font-mono ${Number(l.outstanding_fines) > 0 ? "text-red-600 font-bold" : ""}`}>{fmtKES(l.outstanding_fines ?? 0)}</td>
                  <td className="px-4 py-3 text-xs uppercase tracking-wider">
                    {l.__opening ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">Opening B/F</span> : l.status === "cleared" ? <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold">Cleared</span> : (l.status ?? "").replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link 
                      to="/loans/$loanId" 
                      params={{ loanId: l.__opening ? `opening-${l.openingId}` : l.id }} 
                      className="text-navy hover:underline text-sm"
                    >
                      View Ledger →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

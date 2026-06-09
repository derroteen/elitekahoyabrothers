import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { fmtKES, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/my-loans")({
  component: MyLoans,
  head: () => ({ meta: [{ title: "My Loans — EKB" }] }),
});

function MyLoans() {
  const { user } = useAuth();
  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["my-loans", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("loans").select("*").eq("member_id", user!.id).order("created_at", { ascending: false })).data ?? [],
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
              {loans.map((l: any) => {
                const cleared = Number(l.balance) <= 0 && Number(l.outstanding_fines ?? 0) <= 0;
                return (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{fmtDate(l.loan_date)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtKES(l.amount_borrowed)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtKES(l.amount_paid)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-navy">{fmtKES(l.balance)}</td>
                  <td className={`px-4 py-3 text-right font-mono ${Number(l.outstanding_fines) > 0 ? "text-red-600 font-bold" : ""}`}>{fmtKES(l.outstanding_fines ?? 0)}</td>
                  <td className="px-4 py-3 text-xs uppercase tracking-wider">
                    {cleared ? (
                      <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold border border-emerald-300">CLEARED</span>
                    ) : (l.status ?? "").replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to="/loans/$loanId" params={{ loanId: l.id }} className="text-navy hover:underline text-sm">View Ledger →</Link>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

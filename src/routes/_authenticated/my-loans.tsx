import { createFileRoute } from "@tanstack/react-router";
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
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Borrowed</th>
              <th className="px-4 py-3 text-right">Paid</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && loans.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No loans yet</td></tr>}
            {loans.map((l: any) => (
              <tr key={l.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{fmtDate(l.loan_date)}</td>
                <td className="px-4 py-3 text-right font-mono">{fmtKES(l.amount_borrowed)}</td>
                <td className="px-4 py-3 text-right font-mono">{fmtKES(l.amount_paid)}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-navy">{fmtKES(l.balance)}</td>
                <td className="px-4 py-3 text-xs uppercase tracking-wider">{l.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

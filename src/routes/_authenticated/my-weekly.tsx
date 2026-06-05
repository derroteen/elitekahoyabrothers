import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { fmtKES, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/my-weekly")({
  component: MyWeekly,
  head: () => ({ meta: [{ title: "My Weekly Contributions — EKB" }] }),
});

function MyWeekly() {
  const { user } = useAuth();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["my-weekly", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // RLS already restricts to the member's own rows.
      const { data, error } = await supabase
        .from("weekly_collection_entries")
        .select("id, savings, loan_refund, insurance, benevolent_fund, fine, total, remarks, collection_id, weekly_collections(week_number, collection_date)")
        .eq("member_id", user!.id);
      if (error) throw error;
      const list = (data ?? []) as any[];
      list.sort((a, b) => {
        const da = a.weekly_collections?.collection_date ?? "";
        const db = b.weekly_collections?.collection_date ?? "";
        return db.localeCompare(da);
      });
      return list;
    },
  });

  const totals = rows.reduce(
    (t, r) => ({
      savings: t.savings + Number(r.savings ?? 0),
      loan_refund: t.loan_refund + Number(r.loan_refund ?? 0),
      insurance: t.insurance + Number(r.insurance ?? 0),
      benevolent_fund: t.benevolent_fund + Number(r.benevolent_fund ?? 0),
      fine: t.fine + Number(r.fine ?? 0),
      total: t.total + Number(r.total ?? 0),
    }),
    { savings: 0, loan_refund: 0, insurance: 0, benevolent_fund: 0, fine: 0, total: 0 },
  );

  return (
    <div>
      <PageHeader title="My Weekly Contributions" subtitle="Your personal entries from each Weekly Collection Sheet" />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono min-w-[760px]">
            <thead>
              <tr className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left">Week</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-right">Savings</th>
                <th className="px-3 py-2 text-right">Loan Repayment</th>
                <th className="px-3 py-2 text-right">Insurance</th>
                <th className="px-3 py-2 text-right">Benevolent</th>
                <th className="px-3 py-2 text-right">Fine</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No weekly contributions on file yet</td></tr>}
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">Week {r.weekly_collections?.week_number ?? "—"}</td>
                  <td className="px-3 py-2">{r.weekly_collections?.collection_date ? fmtDate(r.weekly_collections.collection_date) : "—"}</td>
                  <td className="px-3 py-2 text-right">{Number(r.savings).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(r.loan_refund).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(r.insurance).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(r.benevolent_fund).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(r.fine).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-bold text-navy">{Number(r.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-muted/60 font-semibold">
                  <td className="px-3 py-2" colSpan={2}>Totals</td>
                  <td className="px-3 py-2 text-right">{fmtKES(totals.savings)}</td>
                  <td className="px-3 py-2 text-right">{fmtKES(totals.loan_refund)}</td>
                  <td className="px-3 py-2 text-right">{fmtKES(totals.insurance)}</td>
                  <td className="px-3 py-2 text-right">{fmtKES(totals.benevolent_fund)}</td>
                  <td className="px-3 py-2 text-right">{fmtKES(totals.fine)}</td>
                  <td className="px-3 py-2 text-right text-navy">{fmtKES(totals.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}

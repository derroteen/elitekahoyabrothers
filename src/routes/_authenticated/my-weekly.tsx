import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { fmtKES, fmtDate } from "@/lib/format";
import { fetchOpeningBalance } from "@/lib/opening-balances";

export const Route = createFileRoute("/_authenticated/my-weekly")({
  component: MyWeekly,
  head: () => ({ meta: [{ title: "My Weekly Contributions — EKB" }] }),
});

function MyWeekly() {
  const { user } = useAuth();

  const { data: opening } = useQuery({
    queryKey: ["my-weekly-opening", user?.id],
    enabled: !!user,
    queryFn: () => fetchOpeningBalance(user!.id),
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["my-weekly", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_collection_entries")
        .select("id, savings, loan_refund, insurance, benevolent_fund, fine, total, remarks, collection_id, weekly_collections(week_number, collection_date)")
        .eq("member_id", user!.id);
      if (error) throw error;
      const list = (data ?? []) as any[];
      // Sort ascending so we can compute a running cumulative savings balance
      list.sort((a, b) => {
        const da = a.weekly_collections?.collection_date ?? "";
        const db = b.weekly_collections?.collection_date ?? "";
        if (da !== db) return da.localeCompare(db);
        return (a.weekly_collections?.week_number ?? 0) - (b.weekly_collections?.week_number ?? 0);
      });
      return list;
    },
  });

  const openingSavings = Number(opening?.opening_savings ?? 0);

  // Compute running cumulative savings starting from the opening balance
  let running = openingSavings;
  const enriched = rows.map((r: any) => {
    running += Number(r.savings ?? 0);
    return { ...r, cumulative_savings: running };
  });
  // Display newest first
  const display = [...enriched].reverse();

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

  const currentSavingsBalance = openingSavings + totals.savings;

  return (
    <div>
      <PageHeader
        title="My Weekly Contributions"
        subtitle={`Opening savings: ${fmtKES(openingSavings)} · Cumulative savings balance: ${fmtKES(currentSavingsBalance)}`}
      />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono min-w-[880px]">
            <thead>
              <tr className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left">Week No.</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-right">Savings</th>
                <th className="px-3 py-2 text-right">Cumulative Savings</th>
                <th className="px-3 py-2 text-right">Loan Repayment</th>
                <th className="px-3 py-2 text-right">Insurance</th>
                <th className="px-3 py-2 text-right">Benevolent</th>
                <th className="px-3 py-2 text-right">Fine</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && display.length === 0 && (
                <>
                  {openingSavings > 0 && (
                    <tr className="border-t border-border bg-amber-50/40">
                      <td className="px-3 py-2 italic" colSpan={2}>Brought Forward Balance</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right font-bold text-navy">{Number(openingSavings).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right" colSpan={5}>—</td>
                    </tr>
                  )}
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No weekly contributions on file yet</td></tr>
                </>
              )}
              {display.map((r: any) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">Week {r.weekly_collections?.week_number ?? "—"}</td>
                  <td className="px-3 py-2">{r.weekly_collections?.collection_date ? fmtDate(r.weekly_collections.collection_date) : "—"}</td>
                  <td className="px-3 py-2 text-right">{Number(r.savings).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-bold text-navy">{Number(r.cumulative_savings).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(r.loan_refund).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(r.insurance).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(r.benevolent_fund).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(r.fine).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-bold text-navy">{Number(r.total).toFixed(2)}</td>
                </tr>
              ))}
              {!isLoading && display.length > 0 && openingSavings > 0 && (
                <tr className="border-t border-border bg-amber-50/40">
                  <td className="px-3 py-2 italic" colSpan={2}>Brought Forward Balance</td>
                  <td className="px-3 py-2 text-right">—</td>
                  <td className="px-3 py-2 text-right font-bold text-navy">{Number(openingSavings).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right" colSpan={5}>—</td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-muted/60 font-semibold">
                  <td className="px-3 py-2" colSpan={2}>Totals</td>
                  <td className="px-3 py-2 text-right">{fmtKES(totals.savings)}</td>
                  <td className="px-3 py-2 text-right text-navy">{fmtKES(currentSavingsBalance)}</td>
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

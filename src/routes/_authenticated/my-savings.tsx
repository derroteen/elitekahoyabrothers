import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { fmtKES, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/my-savings")({
  component: MySavings,
  head: () => ({ meta: [{ title: "My Savings — EKB" }] }),
});

function MySavings() {
  const { user } = useAuth();
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["my-savings", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("savings_entries").select("*").eq("member_id", user!.id).order("entry_date", { ascending: true })).data ?? [],
  });
  const bal = entries.at(-1)?.balance ?? 0;
  return (
    <div>
      <PageHeader title="My Savings" subtitle={`Current balance: ${fmtKES(bal)}`} />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm font-mono">
            <thead><tr className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left whitespace-nowrap">Date</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Deposit</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Bonus</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Withdrawal</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Balance</th>
            </tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && entries.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No entries yet</td></tr>}
              {entries.map((e: any) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(e.entry_date)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{Number(e.amount).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{Number(e.bonus).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-red-700 whitespace-nowrap">{Number(e.withdrawal).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-navy font-bold whitespace-nowrap">{Number(e.balance).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

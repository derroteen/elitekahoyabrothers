import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { fmtKES, fmtDate } from "@/lib/format";
import { exportCSV, exportXLSX, exportPDF, type Column } from "@/lib/exports";

export const Route = createFileRoute("/_authenticated/my-benevolent")({
  component: MyBenevolent,
  head: () => ({ meta: [{ title: "My Benevolent Fund — EKB" }] }),
});

function MyBenevolent() {
  const { user, profile } = useAuth();

  const { data: opening } = useQuery({
    queryKey: ["my-benevolent-opening", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("member_opening_balances").select("opening_benevolent, effective_date").eq("member_id", user!.id).maybeSingle()).data,
  });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["my-benevolent", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("benevolent_entries").select("*").eq("member_id", user!.id).order("entry_date").order("created_at")).data ?? [],
  });

  const totals = useMemo(() => {
    const c = entries.reduce((s: number, e: any) => s + Number(e.contribution || 0), 0);
    const w = entries.reduce((s: number, e: any) => s + Number(e.withdrawal || 0), 0);
    const bal = (entries.at(-1) as any)?.balance ?? Number(opening?.opening_benevolent ?? 0);
    return { c, w, bal };
  }, [entries, opening]);

  const cols: Column[] = [
    { header: "Date", key: "Date" },
    { header: "Contribution", key: "Contribution", align: "right" },
    { header: "Withdrawal", key: "Withdrawal", align: "right" },
    { header: "Description", key: "Description" },
    { header: "Balance", key: "Balance", align: "right" },
  ];
  const rows = entries.map((e: any) => ({
    Date: fmtDate(e.entry_date),
    Contribution: Number(e.contribution).toFixed(2),
    Withdrawal: Number(e.withdrawal).toFixed(2),
    Description: e.description ?? "",
    Balance: Number(e.balance).toFixed(2),
  }));
  const baseName = `benevolent_${profile?.membership_no ?? "me"}`;

  return (
    <div>
      <PageHeader title="My Benevolent Fund" subtitle={`Current balance: ${fmtKES(totals.bal)}`} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Card className="p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Contributions</div><div className="font-mono text-xl mt-1">{fmtKES(totals.c)}</div></Card>
        <Card className="p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Withdrawals</div><div className="font-mono text-xl mt-1 text-red-700">{fmtKES(totals.w)}</div></Card>
        <Card className="p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current Balance</div><div className="font-mono text-xl mt-1 text-navy font-bold">{fmtKES(totals.bal)}</div></Card>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 justify-end">
        <Button variant="outline" size="sm" onClick={() => exportCSV(`${baseName}.csv`, cols, rows)}>CSV</Button>
        <Button variant="outline" size="sm" onClick={() => exportXLSX(`${baseName}.xlsx`, [{ name: "Benevolent", columns: cols, rows }])}>Excel</Button>
        <Button variant="outline" size="sm" onClick={() => exportPDF(`${baseName}.pdf`, "Benevolent Fund Ledger", [{ heading: profile?.full_name ?? undefined, columns: cols, rows }], { subtitle: profile?.membership_no ?? undefined })}>PDF</Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono">
            <thead><tr className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-right">Contribution</th>
              <th className="px-3 py-2 text-right">Withdrawal</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-right">Balance</th>
            </tr></thead>
            <tbody>
              {opening && Number(opening.opening_benevolent) > 0 && (
                <tr className="border-t border-border bg-gold/5">
                  <td className="px-3 py-2">{fmtDate(opening.effective_date)}</td>
                  <td className="px-3 py-2 text-right">{Number(opening.opening_benevolent).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">—</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">Opening Balance</td>
                  <td className="px-3 py-2 text-right font-semibold">{Number(opening.opening_benevolent).toFixed(2)}</td>
                </tr>
              )}
              {isLoading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && entries.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No entries yet</td></tr>}
              {entries.map((e: any) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-3 py-2">{fmtDate(e.entry_date)}</td>
                  <td className="px-3 py-2 text-right">{Number(e.contribution).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-red-700">{Number(e.withdrawal).toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{e.description ?? ""}</td>
                  <td className="px-3 py-2 text-right text-navy font-bold">{Number(e.balance).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

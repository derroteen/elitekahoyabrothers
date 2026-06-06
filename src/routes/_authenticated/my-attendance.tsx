import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtKES } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/my-attendance")({
  component: MyAttendancePage,
  head: () => ({ meta: [{ title: "My Attendance — EKB" }] }),
});

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function MyAttendancePage() {
  const { user } = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const { data: sheet } = useQuery({
    queryKey: ["my-att-sheet", year, month],
    queryFn: async () => (await supabase.from("attendance_sheets").select("*").eq("year", year).eq("month", month).maybeSingle()).data,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["my-att-entries", sheet?.id, user?.id],
    enabled: !!sheet?.id && !!user?.id,
    queryFn: async () => (await supabase.from("attendance_entries").select("*").eq("sheet_id", sheet!.id).eq("member_id", user!.id).order("week_number")).data ?? [],
  });

  const total = entries.reduce((s: number, e: any) => s + Number(e.fine_amount), 0);

  return (
    <div>
      <PageHeader title="My Attendance" subtitle="Your meeting attendance & fines" />
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div><Label className="text-xs">Year</Label><Input type="number" className="w-24" value={year} onChange={e => setYear(Number(e.target.value))} /></div>
          <div><Label className="text-xs">Month</Label>
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {!sheet && <Card className="p-8 text-center text-muted-foreground">No sheet for this month.</Card>}
      {sheet && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
              <th className="px-3 py-3">Week</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Arrival</th><th className="px-3 py-3 text-right">Fine</th>
            </tr></thead>
            <tbody>
              {(sheet.week_dates as string[]).map((d, i) => {
                const e: any = entries.find((x: any) => x.week_number === i + 1);
                return (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">Wk {i+1}</td>
                    <td className="px-3 py-2 text-muted-foreground">{d}</td>
                    <td className="px-3 py-2 capitalize">{e?.status ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{e?.arrival_time ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtKES(Number(e?.fine_amount ?? 0))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="bg-muted/40 font-medium"><td colSpan={4} className="px-3 py-3 text-right uppercase text-xs tracking-wider">Total Fine</td><td className="px-3 py-3 text-right font-mono">{fmtKES(total)}</td></tr></tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}

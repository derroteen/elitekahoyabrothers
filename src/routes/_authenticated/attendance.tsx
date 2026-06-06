import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtKES } from "@/lib/format";
import { fetchNonMemberIds, filterMembersOnly } from "@/lib/member-queries";
import { exportCSV, exportXLSX, exportPDF, type Column } from "@/lib/exports";
import { FileText, FileSpreadsheet, FileDown, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendancePage,
  head: () => ({ meta: [{ title: "Attendance Sheet — EKB" }] }),
});

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type Status = "present" | "late" | "absent";

type Member = { id: string; full_name: string; membership_no: string | null; sort_order: number | null };
type Sheet = { id: string; year: number; month: number; week_dates: string[]; notes: string | null };
type Entry = { id: string; sheet_id: string; member_id: string; week_number: number; status: Status; arrival_time: string | null; fine_amount: number };

function statusLabel(s: Status) { return s === "present" ? "✓" : s === "late" ? "L" : "✗"; }
function statusColor(s: Status) {
  return s === "present" ? "bg-green-500/20 text-green-700 dark:text-green-300" :
         s === "late" ? "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300" :
         "bg-red-500/20 text-red-700 dark:text-red-300";
}

function AttendancePage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const canEdit = role === "super_admin" || role === "admin";
  const today = new Date();
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth() + 1);

  const { data: members = [] } = useQuery({
    queryKey: ["attendance-members"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles")
        .select("id, full_name, membership_no, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("membership_no");
      const nonMembers = await fetchNonMemberIds();
      return filterMembersOnly((data ?? []) as Member[], nonMembers);
    },
  });

  const { data: sheet, refetch: refetchSheet } = useQuery({
    queryKey: ["attendance-sheet", year, month],
    queryFn: async () => {
      const { data } = await supabase.from("attendance_sheets")
        .select("*").eq("year", year).eq("month", month).maybeSingle();
      return data as Sheet | null;
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["attendance-entries", sheet?.id],
    enabled: !!sheet?.id,
    queryFn: async () => {
      const { data } = await supabase.from("attendance_entries")
        .select("*").eq("sheet_id", sheet!.id);
      return (data ?? []) as Entry[];
    },
  });

  const createSheet = useMutation({
    mutationFn: async () => {
      // Build default Thursdays (or first Sunday) — pick all Sundays of the month as common chama meeting day
      const dates: string[] = [];
      const last = new Date(year, month, 0).getDate();
      for (let d = 1; d <= last; d++) {
        const dt = new Date(year, month - 1, d);
        if (dt.getDay() === 0) dates.push(dt.toISOString().slice(0, 10)); // Sundays
      }
      const { error } = await supabase.from("attendance_sheets").insert({ year, month, week_dates: dates });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Sheet created"); refetchSheet(); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateWeekDates = useMutation({
    mutationFn: async (dates: string[]) => {
      const { error } = await supabase.from("attendance_sheets").update({ week_dates: dates }).eq("id", sheet!.id);
      if (error) throw error;
    },
    onSuccess: () => refetchSheet(),
    onError: (e: any) => toast.error(e.message),
  });

  const upsertEntry = useMutation({
    mutationFn: async (payload: { member_id: string; week_number: number; status: Status; arrival_time?: string | null }) => {
      const existing = entries.find(e => e.member_id === payload.member_id && e.week_number === payload.week_number);
      if (existing) {
        const { error } = await supabase.from("attendance_entries").update({
          status: payload.status, arrival_time: payload.arrival_time ?? null
        }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("attendance_entries").insert({
          sheet_id: sheet!.id, member_id: payload.member_id, week_number: payload.week_number,
          status: payload.status, arrival_time: payload.arrival_time ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance-entries", sheet?.id] }),
    onError: (e: any) => toast.error(e.message),
  });

  const weekCount = sheet?.week_dates.length ?? 0;
  const entryMap = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of entries) m.set(`${e.member_id}:${e.week_number}`, e);
    return m;
  }, [entries]);

  const memberTotal = (memberId: string) =>
    entries.filter(e => e.member_id === memberId).reduce((s, e) => s + Number(e.fine_amount), 0);
  const grandTotal = entries.reduce((s, e) => s + Number(e.fine_amount), 0);

  const exportRows = members.map((m, i) => {
    const row: any = { no: i + 1, name: m.full_name };
    for (let w = 1; w <= weekCount; w++) {
      const e = entryMap.get(`${m.id}:${w}`);
      row[`week_${w}`] = e ? (e.status === "present" ? "P" : e.status === "late" ? `L${e.arrival_time ? " "+e.arrival_time : ""}` : "A") : "";
    }
    row.total = memberTotal(m.id);
    return row;
  });
  const exportCols: Column[] = [
    { key: "no", header: "No" }, { key: "name", header: "Name" },
    ...Array.from({ length: weekCount }, (_, i) => ({ key: `week_${i+1}`, header: `Wk ${i+1}` })),
    { key: "total", header: "Total Fine", format: (v: any) => fmtKES(v) },
  ];
  const baseName = `attendance-${year}-${String(month).padStart(2,"0")}`;

  return (
    <div>
      <PageHeader title="Attendance Sheet" subtitle="Monthly meeting attendance & fines" />

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-xs">Year</Label>
            <Input type="number" className="w-24" value={year} onChange={e => setYear(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Month</Label>
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!sheet && canEdit && (
            <Button onClick={() => createSheet.mutate()}><Plus className="w-4 h-4 mr-1" />Create Sheet</Button>
          )}
          {sheet && (
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => exportCSV(baseName, exportCols, exportRows)}><FileText className="w-4 h-4 mr-1" />CSV</Button>
              <Button variant="outline" size="sm" onClick={() => exportXLSX(baseName, exportCols, exportRows)}><FileSpreadsheet className="w-4 h-4 mr-1" />Excel</Button>
              <Button variant="outline" size="sm" onClick={() => exportPDF(baseName, `Attendance — ${MONTHS[month-1]} ${year}`, exportCols, exportRows)}><FileDown className="w-4 h-4 mr-1" />PDF</Button>
            </div>
          )}
        </div>
      </Card>

      {!sheet && (
        <Card className="p-8 text-center text-muted-foreground">
          No attendance sheet for {MONTHS[month-1]} {year} yet.{canEdit ? " Click Create Sheet." : ""}
        </Card>
      )}

      {sheet && (
        <>
          {canEdit && (
            <Card className="p-4 mb-4">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Week Meeting Dates</div>
              <div className="flex flex-wrap gap-2">
                {sheet.week_dates.map((d, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Label className="text-xs">W{i+1}</Label>
                    <Input type="date" className="w-40" value={d} onChange={e => {
                      const nd = [...sheet.week_dates]; nd[i] = e.target.value; updateWeekDates.mutate(nd);
                    }} />
                    <button className="text-red-500 text-xs" onClick={() => updateWeekDates.mutate(sheet.week_dates.filter((_,j)=>j!==i))}>×</button>
                  </div>
                ))}
                {sheet.week_dates.length < 5 && (
                  <Button variant="outline" size="sm" onClick={() => {
                    const today = new Date(year, month-1, 1).toISOString().slice(0,10);
                    updateWeekDates.mutate([...sheet.week_dates, today]);
                  }}><Plus className="w-3 h-3 mr-1" />Add Week</Button>
                )}
              </div>
            </Card>
          )}

          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
                  <th className="px-2 py-3 w-10">#</th>
                  <th className="px-3 py-3">Member</th>
                  {sheet.week_dates.map((d, i) => (
                    <th key={i} className="px-2 py-3 text-center min-w-[140px]">
                      <div>Wk {i+1}</div>
                      <div className="text-[10px] font-normal text-muted-foreground normal-case">{d}</div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right">Total Fine</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, idx) => (
                  <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-2 py-2 text-muted-foreground">{idx+1}</td>
                    <td className="px-3 py-2 font-medium">{m.full_name}</td>
                    {sheet.week_dates.map((_, wi) => {
                      const w = wi + 1;
                      const e = entryMap.get(`${m.id}:${w}`);
                      const status: Status = e?.status ?? "present";
                      const arrival = e?.arrival_time ?? "";
                      return (
                        <td key={wi} className="px-2 py-2">
                          <div className="flex flex-col gap-1 items-stretch">
                            {canEdit ? (
                              <>
                                <Select value={e ? status : ""} onValueChange={(v) => upsertEntry.mutate({ member_id: m.id, week_number: w, status: v as Status, arrival_time: v === "late" ? arrival || null : null })}>
                                  <SelectTrigger className={`h-7 text-xs ${e ? statusColor(status) : ""}`}><SelectValue placeholder="—" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="present">Present</SelectItem>
                                    <SelectItem value="late">Late (KES 20)</SelectItem>
                                    <SelectItem value="absent">Absent (KES 200)</SelectItem>
                                  </SelectContent>
                                </Select>
                                {status === "late" && e && (
                                  <Input type="time" className="h-7 text-xs" value={arrival} onChange={ev => upsertEntry.mutate({ member_id: m.id, week_number: w, status: "late", arrival_time: ev.target.value })} />
                                )}
                              </>
                            ) : (
                              <span className={`inline-block px-2 py-1 rounded text-xs text-center ${e ? statusColor(status) : "text-muted-foreground"}`}>
                                {e ? `${statusLabel(status)}${arrival ? " "+arrival : ""}` : "—"}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-mono font-medium">{fmtKES(memberTotal(m.id))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/40 font-medium">
                  <td colSpan={2 + weekCount} className="px-3 py-3 text-right uppercase text-xs tracking-wider">Grand Total</td>
                  <td className="px-3 py-3 text-right font-mono">{fmtKES(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import { fmtKES, fmtDate } from "@/lib/format";
import { exportCSV, exportXLSX, exportPDF, type Column } from "@/lib/exports";
import { Pencil, Trash2, FileText, FileSpreadsheet, FileDown } from "lucide-react";
import { deleteWeeklyExpenditure } from "@/lib/entries.functions";

export const Route = createFileRoute("/_authenticated/weekly-expenditures")({
  component: WeeklyExpendituresPage,
  head: () => ({ meta: [{ title: "Weekly Expenditures — EKB" }] }),
});

type Expenditure = {
  id: string;
  expenditure_date: string;
  week_number: number;
  year: number;
  particulars: string;
  amount: number;
  quantity: number | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  recorder?: { full_name: string | null } | null;
};

function isoWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function WeeklyExpendituresPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const canEdit = role === "super_admin" || role === "admin";
  const canDelete = role === "super_admin";
  const doDelete = useServerFn(deleteWeeklyExpenditure);

  const today = new Date();
  const [filters, setFilters] = useState({
    week: "" as string,
    month: "" as string,
    year: String(today.getFullYear()),
    from: "" as string,
    to: "" as string,
  });
  const [dialog, setDialog] = useState<{ open: boolean; editing: Expenditure | null }>({ open: false, editing: null });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["weekly-expenditures", filters],
    queryFn: async () => {
      let q = supabase
        .from("weekly_expenditures")
        .select("*")
        .order("expenditure_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (filters.year) q = q.eq("year", Number(filters.year));
      if (filters.week) q = q.eq("week_number", Number(filters.week));
      if (filters.month) {
        const m = Number(filters.month);
        const y = Number(filters.year || today.getFullYear());
        const first = new Date(y, m - 1, 1).toISOString().slice(0, 10);
        const last = new Date(y, m, 0).toISOString().slice(0, 10);
        q = q.gte("expenditure_date", first).lte("expenditure_date", last);
      }
      if (filters.from) q = q.gte("expenditure_date", filters.from);
      if (filters.to) q = q.lte("expenditure_date", filters.to);

      const { data, error } = await q;
      if (error) throw error;
      const list = (data as any[]) as Expenditure[];

      // Resolve recorder names from profiles
      const ids = Array.from(new Set(list.map((r) => r.recorded_by).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        const map = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
        for (const r of list) r.recorder = r.recorded_by ? { full_name: map.get(r.recorded_by) ?? null } : null;
      }
      return list;
    },
  });

  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.amount || 0), 0), [rows]);

  // Weekly financial summary: only show when filtered to a single week (week+year)
  const showSummary = !!filters.week && !!filters.year && !filters.month && !filters.from && !filters.to;
  const { data: summary } = useQuery({
    queryKey: ["weekly-expenditures-summary", filters.year, filters.week],
    enabled: showSummary,
    queryFn: async () => {
      const y = Number(filters.year);
      const w = Number(filters.week);
      // Find weekly_collections matching that ISO week & year
      const { data: cols } = await supabase
        .from("weekly_collections")
        .select("id, banked_in_advance, cash_in_hand, collection_date, week_number");
      const matched = (cols ?? []).filter((c: any) => {
        const d = new Date(c.collection_date);
        return c.week_number === w && d.getFullYear() === y;
      });
      const ids = matched.map((c: any) => c.id);
      let collectionsTotal = 0;
      let banked = 0;
      let cashInHand = 0;
      if (ids.length) {
        const { data: entries } = await supabase
          .from("weekly_collection_entries")
          .select("total, collection_id")
          .in("collection_id", ids);
        collectionsTotal = (entries ?? []).reduce((s: number, e: any) => s + Number(e.total || 0), 0);
        banked = matched.reduce((s: number, c: any) => s + Number(c.banked_in_advance || 0), 0);
        cashInHand = matched.reduce((s: number, c: any) => s + Number(c.cash_in_hand || 0), 0);
      }
      return { collectionsTotal, banked, cashInHand };
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await doDelete({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Expenditure deleted");
      qc.invalidateQueries({ queryKey: ["weekly-expenditures"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const exportColumns: Column[] = [
    { header: "Week", key: "week_number", align: "center", width: 8 },
    { header: "Date", key: "date_str", width: 14 },
    { header: "Particulars", key: "particulars", width: 36 },
    { header: "Quantity", key: "quantity", align: "right", width: 10 },
    { header: "Amount (KES)", key: "amount_num", align: "right", width: 14 },
    { header: "Recorded By", key: "recorded_by_name", width: 22 },
  ];

  const exportRows = rows.map((r) => ({
    week_number: r.week_number,
    date_str: fmtDate(r.expenditure_date),
    particulars: r.particulars,
    quantity: r.quantity ?? "",
    amount_num: Number(r.amount).toFixed(2),
    recorded_by_name: r.recorder?.full_name ?? "—",
  }));

  const totalRow = {
    week_number: "",
    date_str: "",
    particulars: "TOTAL",
    quantity: "",
    amount_num: total.toFixed(2),
    recorded_by_name: "",
  };

  const fileBase = `weekly-expenditures-${filters.year || "all"}${filters.week ? `-W${filters.week}` : ""}`;

  return (
    <div>
      <PageHeader
        title="Weekly Expenditures"
        subtitle="Track and record all chama expenses"
        actions={
          canEdit ? (
            <Button onClick={() => setDialog({ open: true, editing: null })} className="bg-navy text-white hover:bg-navy-2">
              + Add Expenditure
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <Card className="p-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <Label className="text-xs">Year</Label>
            <Input type="number" value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Week #</Label>
            <Input type="number" min={1} max={53} value={filters.week} onChange={(e) => setFilters({ ...filters, week: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Month</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={filters.month}
              onChange={(e) => setFilters({ ...filters, month: e.target.value })}
            >
              <option value="">All</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString("en", { month: "long" })}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={() => setFilters({ week: "", month: "", year: String(today.getFullYear()), from: "", to: "" })}>
              Reset
            </Button>
          </div>
        </div>
      </Card>

      {/* Weekly Financial Summary */}
      {showSummary && summary && (
        <Card className="p-4 mb-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            Weekly Financial Summary · Week {filters.week} / {filters.year}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Total Collections" value={fmtKES(summary.collectionsTotal)} />
            <Stat label="Total Expenditures" value={fmtKES(total)} />
            <Stat label="Cash Banked" value={fmtKES(summary.banked)} />
            <Stat label="Cash in Hand" value={fmtKES(summary.cashInHand)} />
            <Stat label="Net Weekly Position" value={fmtKES(summary.collectionsTotal - total)} highlight />
          </div>
        </Card>
      )}

      {/* Export buttons */}
      <div className="flex flex-wrap gap-2 mb-3">
        <Button variant="outline" size="sm" onClick={() => exportCSV(`${fileBase}.csv`, exportColumns, [...exportRows, totalRow])}>
          <FileDown className="w-4 h-4" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportXLSX(`${fileBase}.xlsx`, [{ name: "Expenditures", columns: exportColumns, rows: [...exportRows, totalRow] }])}>
          <FileSpreadsheet className="w-4 h-4" /> Excel
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportPDF(`${fileBase}.pdf`, "Weekly Expenditures", [{ columns: exportColumns, rows: [...exportRows, totalRow] }], {
              subtitle: `Total: ${fmtKES(total)}`,
            })
          }
        >
          <FileText className="w-4 h-4" /> PDF
        </Button>
      </div>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Particulars</TableHead>
                <TableHead className="text-right">Cash Paid</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>Recorded By</TableHead>
                <TableHead>Date Recorded</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={canEdit ? 7 : 6} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={canEdit ? 7 : 6} className="text-center text-muted-foreground py-6">No expenditures found for these filters</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{fmtDate(r.expenditure_date)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.particulars}</div>
                    {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
                  </TableCell>
                  <TableCell className="text-right font-mono whitespace-nowrap">{fmtKES(r.amount)}</TableCell>
                  <TableCell className="text-right">{r.quantity ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.recorder?.full_name ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(r.created_at)}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-800" onClick={() => setDialog({ open: true, editing: r })}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-800"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this entry? This action cannot be undone.")) del.mutate(r.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {rows.length > 0 && (
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={2}>Total Weekly Expenditure</TableCell>
                  <TableCell className="text-right font-mono">{fmtKES(total)}</TableCell>
                  <TableCell colSpan={canEdit ? 4 : 3} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ExpenditureDialog
        open={dialog.open}
        editing={dialog.editing}
        onOpenChange={(open) => setDialog({ open, editing: open ? dialog.editing : null })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["weekly-expenditures"] });
          qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
        }}
      />
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 border ${highlight ? "bg-gold/10 border-gold/40" : "bg-card border-border"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-medium mt-1">{value}</div>
    </div>
  );
}

function ExpenditureDialog({
  open,
  editing,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  editing: Expenditure | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState(() => initForm(editing));
  const [submitting, setSubmitting] = useState(false);

  // Reset form when dialog opens with different record
  useEffect(() => {
    if (open) setForm(initForm(editing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  function initForm(e: Expenditure | null) {
    return {
      expenditure_date: e?.expenditure_date ?? new Date().toISOString().slice(0, 10),
      particulars: e?.particulars ?? "",
      amount: e ? String(e.amount) : "",
      quantity: e?.quantity != null ? String(e.quantity) : "",
      notes: e?.notes ?? "",
    };
  }

  const submit = async () => {
    if (!form.expenditure_date) return toast.error("Date is required");
    if (!form.particulars.trim()) return toast.error("Particulars are required");
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt < 0) return toast.error("Enter a valid amount");

    setSubmitting(true);
    const payload = {
      expenditure_date: form.expenditure_date,
      particulars: form.particulars.trim(),
      amount: amt,
      quantity: form.quantity ? Number(form.quantity) : null,
      notes: form.notes.trim() || null,
      recorded_by: user?.id ?? null,
      // week_number/year auto-set by trigger
      week_number: isoWeek(new Date(form.expenditure_date)),
      year: new Date(form.expenditure_date).getFullYear(),
    };

    const res = editing
      ? await supabase.from("weekly_expenditures").update(payload).eq("id", editing.id)
      : await supabase.from("weekly_expenditures").insert(payload);

    setSubmitting(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Expenditure updated" : "Expenditure saved");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">{editing ? "Edit Expenditure" : "New Expenditure"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Expenditure Date</Label>
            <Input type="date" value={form.expenditure_date} onChange={(e) => setForm({ ...form, expenditure_date: e.target.value })} />
          </div>
          <div>
            <Label>Particulars</Label>
            <Input value={form.particulars} placeholder="e.g. Typing and Printing" onChange={(e) => setForm({ ...form, particulars: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount Paid (KES)</Label>
              <Input type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <Label>Quantity (optional)</Label>
              <Input type="number" min={0} step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-navy text-white hover:bg-navy-2">
            {submitting ? "Saving…" : "Save Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

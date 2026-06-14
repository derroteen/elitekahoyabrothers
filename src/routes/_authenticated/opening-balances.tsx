import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtKES, fmtDate } from "@/lib/format";
import {
  upsertOpeningBalance,
  bulkImportOpeningBalances,
} from "@/lib/opening-balances.functions";
import { deleteOpeningBalance } from "@/lib/entries.functions";

export const Route = createFileRoute("/_authenticated/opening-balances")({
  component: OpeningBalancesPage,
  head: () => ({
    meta: [
      { title: "Opening Balances — Elite Kahoya Brothers" },
      {
        name: "description",
        content:
          "Manage brought-forward balances (savings, loans, fines, insurance, benevolent fund) for every member.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

type Row = {
  id: string;
  full_name: string;
  membership_no: string | null;
  effective_date: string | null;
  opening_savings: number;
  opening_loan: number;
  opening_fine: number;
  opening_insurance: number;
  opening_benevolent: number;
  notes: string | null;
};

function OpeningBalancesPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canEdit = role === "super_admin" || role === "admin";
  const canDelete = role === "super_admin";
  const doDelete = useServerFn(deleteOpeningBalance);

  useEffect(() => {
    if (!loading && role && !canEdit) navigate({ to: "/dashboard" });
  }, [loading, role, canEdit, navigate]);

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["opening-balances"],
    enabled: canEdit,
    queryFn: async (): Promise<Row[]> => {
      const { fetchNonMemberIds, filterMembersOnly } = await import("@/lib/member-queries");
      const [profilesRes, balancesRes, nonMembers] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, membership_no")
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("membership_no"),
        supabase.from("member_opening_balances").select("*"),
        fetchNonMemberIds(),
      ]);
      const members = filterMembersOnly(profilesRes.data ?? [], nonMembers);
      const map = new Map((balancesRes.data ?? []).map((b: any) => [b.member_id, b]));
      return members.map((m: any) => {
        const b: any = map.get(m.id);
        return {
          id: m.id,
          full_name: m.full_name,
          membership_no: m.membership_no,
          effective_date: b?.effective_date ?? null,
          opening_savings: Number(b?.opening_savings ?? 0),
          opening_loan: Number(b?.opening_loan ?? 0),
          opening_fine: Number(b?.opening_fine ?? 0),
          opening_insurance: Number(b?.opening_insurance ?? 0),
          opening_benevolent: Number(b?.opening_benevolent ?? 0),
          notes: b?.notes ?? null,
        };
      });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        (r.membership_no ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  if (loading || !role) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!canEdit) return null;

  return (
    <div>
      <PageHeader
        title="Opening Balances"
        subtitle="Brought-forward balances from before the website was launched"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              Bulk import
            </Button>
          </div>
        }
      />

      <Card className="p-4 mb-4">
        <Label className="text-xs uppercase tracking-wider">Search</Label>
        <Input
          className="max-w-md mt-1"
          placeholder="Name or membership number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left">EKB ID</th>
              <th className="px-3 py-2 text-left">Member</th>
              <th className="px-3 py-2 text-left">Effective Date</th>
              <th className="px-3 py-2 text-right">Savings B/F</th>
              <th className="px-3 py-2 text-right">Loan B/F</th>
              <th className="px-3 py-2 text-right">Fine B/F</th>
              <th className="px-3 py-2 text-right">Insurance B/F</th>
              <th className="px-3 py-2 text-right">Benevolent B/F</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-muted-foreground">
                  No members found.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-3 py-2 font-mono text-xs">{r.membership_no ?? "—"}</td>
                <td className="px-3 py-2">{r.full_name}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.effective_date ? fmtDate(r.effective_date) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono">{fmtKES(r.opening_savings)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtKES(r.opening_loan)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtKES(r.opening_fine)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtKES(r.opening_insurance)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtKES(r.opening_benevolent)}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <EditDialog
        row={editing}
        onClose={() => setEditing(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["opening-balances"] })}
      />
      <BulkImportDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onImported={() => qc.invalidateQueries({ queryKey: ["opening-balances"] })}
      />
    </div>
  );
}

function EditDialog({
  row,
  onClose,
  onSaved,
}: {
  row: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const upsert = useServerFn(upsertOpeningBalance);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    effective_date: new Date().toISOString().slice(0, 10),
    opening_savings: "0",
    opening_loan: "0",
    opening_fine: "0",
    opening_insurance: "0",
    opening_benevolent: "0",
    notes: "",
  });

  useEffect(() => {
    if (!row) return;
    setForm({
      effective_date: row.effective_date ?? new Date().toISOString().slice(0, 10),
      opening_savings: String(row.opening_savings),
      opening_loan: String(row.opening_loan),
      opening_fine: String(row.opening_fine),
      opening_insurance: String(row.opening_insurance),
      opening_benevolent: String(row.opening_benevolent),
      notes: row.notes ?? "",
    });
  }, [row]);

  const submit = async () => {
    if (!row) return;
    setSubmitting(true);
    try {
      await upsert({
        data: {
          member_id: row.id,
          effective_date: form.effective_date,
          opening_savings: Number(form.opening_savings || 0),
          opening_loan: Number(form.opening_loan || 0),
          opening_fine: Number(form.opening_fine || 0),
          opening_insurance: Number(form.opening_insurance || 0),
          opening_benevolent: Number(form.opening_benevolent || 0),
          notes: form.notes || null,
        },
      });
      toast.success("Opening balance saved");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif">
            {row?.full_name}{" "}
            <span className="font-mono text-xs text-muted-foreground">
              · {row?.membership_no ?? "—"}
            </span>
          </DialogTitle>
          <DialogDescription>
            Brought-forward balances at the start date below. These appear as the first
            row in the member's passbook.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Effective Date</Label>
            <Input
              type="date"
              value={form.effective_date}
              onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
            />
          </div>
          <div>
            <Label>Opening Savings (KSh)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.opening_savings}
              onChange={(e) => setForm({ ...form, opening_savings: e.target.value })}
            />
          </div>
          <div>
            <Label>Opening Loan (KSh)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.opening_loan}
              onChange={(e) => setForm({ ...form, opening_loan: e.target.value })}
            />
          </div>
          <div>
            <Label>Opening Fine (KSh)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.opening_fine}
              onChange={(e) => setForm({ ...form, opening_fine: e.target.value })}
            />
          </div>
          <div>
            <Label>Opening Insurance (KSh)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.opening_insurance}
              onChange={(e) => setForm({ ...form, opening_insurance: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <Label>Opening Benevolent Fund (KSh)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.opening_benevolent}
              onChange={(e) => setForm({ ...form, opening_benevolent: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <Label>Notes / Remarks</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting}
            className="bg-navy text-white hover:bg-navy-2"
          >
            {submitting ? "Saving…" : "Save Opening Balance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ParsedRow = {
  membership_no: string;
  effective_date: string;
  opening_savings: number;
  opening_loan: number;
  opening_fine: number;
  opening_insurance: number;
  opening_benevolent: number;
  notes: string | null;
  __error?: string;
};

function toIsoDate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  // Excel serial date
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 25569 && n < 60000) {
      const d = new Date(Math.round((n - 25569) * 86400 * 1000));
      return d.toISOString().slice(0, 10);
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function num(v: any): number {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function BulkImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}) {
  const bulk = useServerFn(bulkImportOpeningBalances);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [serverErrors, setServerErrors] = useState<{ row: number; membership_no: string; error: string }[]>([]);

  useEffect(() => {
    if (!open) {
      setParsed([]);
      setServerErrors([]);
    }
  }, [open]);

  const onFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
    parseRows(rows);
  };

  const parseRows = (rows: any[]) => {
    const out: ParsedRow[] = rows.map((r) => {
      const norm = Object.fromEntries(
        Object.entries(r).map(([k, v]) => [String(k).trim().toLowerCase(), v]),
      );
      const membership_no = String(
        norm["membership no"] ?? norm["member id"] ?? norm["membership_no"] ?? norm["ekb id"] ?? "",
      ).trim();
      const dateRaw = norm["effective date"] ?? norm["effective_date"] ?? norm["date"];
      const effective_date = toIsoDate(dateRaw) ?? "";
      const savings = num(norm["opening savings"] ?? norm["opening_savings"] ?? norm["savings"]);
      const loan = num(norm["opening loan"] ?? norm["opening_loan"] ?? norm["loan"]);
      const fine = num(norm["opening fine"] ?? norm["opening_fine"] ?? norm["fine"]);
      const insurance = num(norm["opening insurance"] ?? norm["opening_insurance"] ?? norm["insurance"]);
      const benev = num(
        norm["opening benevolent fund"] ??
          norm["opening_benevolent"] ??
          norm["benevolent"] ??
          norm["benevolent fund"],
      );
      const notes = String(norm["notes"] ?? norm["remarks"] ?? "").trim() || null;

      const issues: string[] = [];
      if (!membership_no) issues.push("Missing membership number");
      if (!effective_date) issues.push("Invalid date");
      for (const [name, n] of [
        ["savings", savings],
        ["loan", loan],
        ["fine", fine],
        ["insurance", insurance],
        ["benevolent", benev],
      ] as const) {
        if (!Number.isFinite(n)) issues.push(`Invalid ${name}`);
      }
      return {
        membership_no: membership_no.toUpperCase(),
        effective_date,
        opening_savings: Number.isFinite(savings) ? savings : 0,
        opening_loan: Number.isFinite(loan) ? loan : 0,
        opening_fine: Number.isFinite(fine) ? fine : 0,
        opening_insurance: Number.isFinite(insurance) ? insurance : 0,
        opening_benevolent: Number.isFinite(benev) ? benev : 0,
        notes,
        __error: issues.length ? issues.join("; ") : undefined,
      };
    });
    setParsed(out);
    setServerErrors([]);
  };

  const validRows = parsed.filter((r) => !r.__error);
  const invalidRows = parsed.filter((r) => r.__error);

  const submit = async () => {
    if (validRows.length === 0) return;
    setSubmitting(true);
    setServerErrors([]);
    try {
      const res = await bulk({
        data: {
          rows: validRows.map((r) => ({
            membership_no: r.membership_no,
            effective_date: r.effective_date,
            opening_savings: r.opening_savings,
            opening_loan: r.opening_loan,
            opening_fine: r.opening_fine,
            opening_insurance: r.opening_insurance,
            opening_benevolent: r.opening_benevolent,
            notes: r.notes,
          })),
        },
      });
      setServerErrors(res.errors ?? []);
      toast.success(`Imported ${res.processed} opening balance(s)`);
      onImported();
      if ((res.errors ?? []).length === 0) onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setSubmitting(false);
    }
  };

  const downloadTemplate = () => {
    const aoa = [
      [
        "Membership No",
        "Member Name",
        "Opening Savings",
        "Opening Loan",
        "Opening Fine",
        "Opening Insurance",
        "Opening Benevolent Fund",
        "Effective Date",
        "Notes",
      ],
      ["EKB001", "Sample Member", 48000, 12000, 400, 1200, 0, "2026-07-01", "Brought forward"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Opening Balances");
    XLSX.writeFile(wb, "opening-balances-template.xlsx");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-serif">Bulk import opening balances</DialogTitle>
          <DialogDescription>
            Upload a CSV or XLSX with columns: Membership No, Opening Savings, Opening Loan,
            Opening Fine, Opening Insurance, Opening Benevolent Fund, Effective Date, Notes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
              className="text-sm"
            />
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              Download template
            </Button>
            {parsed.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {validRows.length} valid · {invalidRows.length} with errors
              </span>
            )}
          </div>

          {parsed.length > 0 && (
            <div className="max-h-80 overflow-auto border border-border rounded-md">
              <table className="w-full text-xs font-mono">
                <thead className="bg-muted/60 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left">EKB ID</th>
                    <th className="px-2 py-1 text-left">Date</th>
                    <th className="px-2 py-1 text-right">Savings</th>
                    <th className="px-2 py-1 text-right">Loan</th>
                    <th className="px-2 py-1 text-right">Fine</th>
                    <th className="px-2 py-1 text-right">Insurance</th>
                    <th className="px-2 py-1 text-right">Benev.</th>
                    <th className="px-2 py-1 text-left">Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((r, i) => (
                    <tr
                      key={i}
                      className={`border-t border-border ${r.__error ? "bg-red-50" : ""}`}
                    >
                      <td className="px-2 py-1">{r.membership_no}</td>
                      <td className="px-2 py-1">{r.effective_date}</td>
                      <td className="px-2 py-1 text-right">{fmtKES(r.opening_savings)}</td>
                      <td className="px-2 py-1 text-right">{fmtKES(r.opening_loan)}</td>
                      <td className="px-2 py-1 text-right">{fmtKES(r.opening_fine)}</td>
                      <td className="px-2 py-1 text-right">{fmtKES(r.opening_insurance)}</td>
                      <td className="px-2 py-1 text-right">{fmtKES(r.opening_benevolent)}</td>
                      <td className="px-2 py-1 text-red-700">{r.__error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {serverErrors.length > 0 && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
              <div className="font-semibold mb-1">Server rejected {serverErrors.length} row(s):</div>
              <ul className="list-disc ml-4">
                {serverErrors.map((e, i) => (
                  <li key={i}>
                    Row {e.row} ({e.membership_no}): {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={submitting || validRows.length === 0}
            onClick={submit}
            className="bg-navy text-white hover:bg-navy-2"
          >
            {submitting ? "Importing…" : `Import ${validRows.length} row(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

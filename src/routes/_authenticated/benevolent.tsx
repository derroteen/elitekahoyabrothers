import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtKES, fmtDate } from "@/lib/format";
import { exportCSV, exportXLSX, exportPDF, type Column } from "@/lib/exports";
import { Pencil, Trash2 } from "lucide-react";
import { deleteBenevolentEntry } from "@/lib/entries.functions";

export const Route = createFileRoute("/_authenticated/benevolent")({
  component: BenevolentLedger,
  head: () => ({ meta: [{ title: "Benevolent Fund — EKB" }] }),
});

type TxType = "contribution" | "withdrawal" | "adjustment" | "opening_balance";
type Entry = {
  id: string; member_id: string; entry_date: string;
  transaction_type: TxType; contribution: number; withdrawal: number;
  balance: number; description: string | null; weekly_entry_id: string | null; source: string;
};

const TX_LABEL: Record<TxType, string> = {
  contribution: "Contribution", withdrawal: "Withdrawal",
  adjustment: "Adjustment", opening_balance: "Opening Balance",
};

function BenevolentLedger() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const doForceDelete = useServerFn(deleteBenevolentEntry);
  const [memberId, setMemberId] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [filters, setFilters] = useState({ type: "all", from: "", to: "" });

  const isStaff = role === "super_admin" || role === "admin" || role === "auditor";
  const canEdit = role === "super_admin" || role === "admin";
  const canDelete = role === "super_admin";

  useEffect(() => { if (!loading && role && !isStaff) navigate({ to: "/my-benevolent" }); }, [loading, role, isStaff, navigate]);

  const { data: members = [] } = useQuery({
    queryKey: ["members-lite"],
    enabled: isStaff,
    queryFn: async () => {
      const { fetchNonMemberIds, filterMembersOnly } = await import("@/lib/member-queries");
      const [profilesRes, nonMembers] = await Promise.all([
        supabase.from("profiles").select("id, full_name, membership_no").order("sort_order", { ascending: true, nullsFirst: false }).order("membership_no"),
        fetchNonMemberIds(),
      ]);
      return filterMembersOnly(profilesRes.data ?? [], nonMembers);
    },
  });

  const { data: opening } = useQuery({
    queryKey: ["benevolent-opening", memberId],
    enabled: !!memberId,
    queryFn: async () => (await supabase.from("member_opening_balances").select("opening_benevolent, effective_date").eq("member_id", memberId).maybeSingle()).data,
  });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["benevolent-entries", memberId],
    enabled: !!memberId,
    queryFn: async () => (await supabase.from("benevolent_entries").select("*").eq("member_id", memberId).order("entry_date").order("created_at")).data as Entry[] ?? [],
  });

  const filtered = useMemo(() => entries.filter((e) => {
    if (filters.type !== "all" && e.transaction_type !== filters.type) return false;
    if (filters.from && e.entry_date < filters.from) return false;
    if (filters.to && e.entry_date > filters.to) return false;
    return true;
  }), [entries, filters]);

  const totals = useMemo(() => {
    const c = filtered.reduce((s, e) => s + Number(e.contribution || 0), 0);
    const w = filtered.reduce((s, e) => s + Number(e.withdrawal || 0), 0);
    const bal = entries.at(-1)?.balance ?? Number(opening?.opening_benevolent ?? 0);
    return { contributions: c, withdrawals: w, balance: bal };
  }, [filtered, entries, opening]);

  const member = members.find((m: any) => m.id === memberId);

  const onDelete = async (e: Entry) => {
    if (!confirm("Are you sure you want to delete this entry? This action cannot be undone.")) return;
    try {
      if (e.source === "weekly") {
        const { deleteBenevolentEntry } = await import("@/lib/entries.functions");
        const { useServerFn } = await import("@tanstack/react-start");
        // call directly without hook (one-off)
        await deleteBenevolentEntry({ data: { id: e.id } } as any);
        void useServerFn;
      } else {
        const { error } = await supabase.from("benevolent_entries").delete().eq("id", e.id);
        if (error) throw error;
      }
      toast.success("Entry deleted");
      qc.invalidateQueries({ queryKey: ["benevolent-entries", memberId] });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete");
    }
  };

  const exportRows = filtered.map((e) => ({
    Date: fmtDate(e.entry_date),
    Type: TX_LABEL[e.transaction_type],
    Contribution: Number(e.contribution).toFixed(2),
    Withdrawal: Number(e.withdrawal).toFixed(2),
    Description: e.description ?? "",
    Balance: Number(e.balance).toFixed(2),
  }));
  const cols: Column[] = [
    { header: "Date", key: "Date" }, { header: "Type", key: "Type" },
    { header: "Contribution", key: "Contribution", align: "right" },
    { header: "Withdrawal", key: "Withdrawal", align: "right" },
    { header: "Description", key: "Description" },
    { header: "Balance", key: "Balance", align: "right" },
  ];
  const baseName = `benevolent_${member?.membership_no ?? "member"}`;

  if (loading || !role) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isStaff) return null;

  return (
    <div>
      <PageHeader
        title="Benevolent Fund Ledger"
        subtitle="Per-member benevolent fund book"
        actions={canEdit && memberId ? <Button onClick={() => { setEditing(null); setOpen(true); }} className="bg-navy text-white hover:bg-navy-2">+ New Entry</Button> : undefined}
      />

      <Card className="p-4 mb-4">
        <div className="grid md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs uppercase tracking-wider">Member</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Choose member…" /></SelectTrigger>
              <SelectContent>{members.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.membership_no} · {m.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider">Type</Label>
            <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="contribution">Contribution</SelectItem>
                <SelectItem value="withdrawal">Withdrawal</SelectItem>
                <SelectItem value="adjustment">Adjustment</SelectItem>
                <SelectItem value="opening_balance">Opening Balance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs uppercase tracking-wider">From</Label><Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs uppercase tracking-wider">To</Label><Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="mt-1" /></div>
          </div>
        </div>
      </Card>

      {memberId && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <Card className="p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Contributions</div><div className="font-mono text-xl mt-1">{fmtKES(totals.contributions)}</div></Card>
            <Card className="p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Withdrawals</div><div className="font-mono text-xl mt-1 text-red-700">{fmtKES(totals.withdrawals)}</div></Card>
            <Card className="p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current Balance</div><div className="font-mono text-xl mt-1 text-navy font-bold">{fmtKES(totals.balance)}</div></Card>
          </div>

          <div className="flex flex-wrap gap-2 mb-3 justify-end">
            <Button variant="outline" size="sm" onClick={() => exportCSV(`${baseName}.csv`, cols, exportRows)}>CSV</Button>
            <Button variant="outline" size="sm" onClick={() => exportXLSX(`${baseName}.xlsx`, [{ name: "Benevolent", columns: cols, rows: exportRows }])}>Excel</Button>
            <Button variant="outline" size="sm" onClick={() => exportPDF(`${baseName}.pdf`, "Benevolent Fund Ledger", [{ heading: member?.full_name ?? undefined, columns: cols, rows: exportRows }], { subtitle: member?.membership_no ?? undefined })}>PDF</Button>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-mono">
                <thead><tr className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">Contribution</th>
                  <th className="px-3 py-2 text-right">Withdrawal</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  {canEdit && <th className="px-3 py-2"></th>}
                </tr></thead>
                <tbody>
                  {opening && Number(opening.opening_benevolent) > 0 && (
                    <tr className="border-t border-border bg-gold/5">
                      <td className="px-3 py-2">{fmtDate(opening.effective_date)}</td>
                      <td className="px-3 py-2 text-xs uppercase">Opening</td>
                      <td className="px-3 py-2 text-right">{Number(opening.opening_benevolent).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">Opening Balance</td>
                      <td className="px-3 py-2 text-right font-semibold">{Number(opening.opening_benevolent).toFixed(2)}</td>
                      {canEdit && <td></td>}
                    </tr>
                  )}
                  {isLoading && <tr><td colSpan={canEdit ? 7 : 6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
                  {!isLoading && filtered.length === 0 && <tr><td colSpan={canEdit ? 7 : 6} className="p-6 text-center text-muted-foreground">No entries</td></tr>}
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-t border-border">
                      <td className="px-3 py-2">{fmtDate(e.entry_date)}</td>
                      <td className="px-3 py-2 text-xs">{TX_LABEL[e.transaction_type]}{e.source === "weekly" && <span className="ml-1 text-[9px] text-muted-foreground">(Weekly)</span>}</td>
                      <td className="px-3 py-2 text-right">{Number(e.contribution).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-red-700">{Number(e.withdrawal).toFixed(2)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{e.description ?? ""}</td>
                      <td className="px-3 py-2 text-right text-navy font-bold">{Number(e.balance).toFixed(2)}</td>
                      {canEdit && (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {e.source !== "weekly" ? (
                            <>
                              <button onClick={() => { setEditing(e); setOpen(true); }} className="text-blue-600 hover:text-blue-800 mr-3" title="Edit"><Pencil className="w-4 h-4 inline" /></button>
                              {canDelete && (
                                <button onClick={() => onDelete(e.id)} className="text-red-600 hover:text-red-800" title="Delete"><Trash2 className="w-4 h-4 inline" /></button>
                              )}
                            </>
                          ) : <span className="text-[9px] text-muted-foreground">Auto-posted</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <EntryDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}
        memberId={memberId}
        editing={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["benevolent-entries", memberId] })}
      />
    </div>
  );
}

function EntryDialog({ open, onOpenChange, memberId, editing, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; memberId: string; editing: Entry | null; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    transaction_type: "contribution" as TxType,
    amount: "", description: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editing) {
      const isWithdrawal = Number(editing.withdrawal) > 0;
      setForm({
        entry_date: editing.entry_date,
        transaction_type: editing.transaction_type,
        amount: String(isWithdrawal ? editing.withdrawal : editing.contribution),
        description: editing.description ?? "",
      });
    } else {
      setForm({ entry_date: new Date().toISOString().slice(0, 10), transaction_type: "contribution", amount: "", description: "" });
    }
  }, [editing, open]);

  const submit = async () => {
    if (!memberId) return;
    const amt = Number(form.amount || 0);
    if (amt <= 0) return toast.error("Amount must be greater than 0");
    setSubmitting(true);
    const isWithdrawal = form.transaction_type === "withdrawal";
    const payload = {
      member_id: memberId,
      entry_date: form.entry_date,
      transaction_type: form.transaction_type,
      contribution: isWithdrawal ? 0 : amt,
      withdrawal: isWithdrawal ? amt : 0,
      description: form.description || null,
      source: "manual",
    };
    const res = editing
      ? await supabase.from("benevolent_entries").update(payload).eq("id", editing.id)
      : await supabase.from("benevolent_entries").insert(payload);
    setSubmitting(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Updated" : "Saved");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">{editing ? "Edit Entry" : "New Benevolent Entry"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Date</Label><Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></div>
          <div>
            <Label>Type</Label>
            <Select value={form.transaction_type} onValueChange={(v) => setForm({ ...form, transaction_type: v as TxType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contribution">Contribution</SelectItem>
                <SelectItem value="withdrawal">Withdrawal</SelectItem>
                <SelectItem value="adjustment">Adjustment</SelectItem>
                <SelectItem value="opening_balance">Opening Balance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Amount (KES)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="col-span-2"><Label>Description / Reason</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Weekly Contribution, Emergency Assistance" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-navy text-white hover:bg-navy-2">{submitting ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

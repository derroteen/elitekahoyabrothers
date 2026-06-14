import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Pencil, Trash2 } from "lucide-react";
import { deleteSavingsEntry } from "@/lib/entries.functions";

export const Route = createFileRoute("/_authenticated/savings")({
  component: SavingsAdmin,
  head: () => ({ meta: [{ title: "Savings — EKB" }] }),
});

type Entry = {
  id: string; member_id: string; entry_date: string;
  amount: number; bonus: number; total: number; withdrawal: number;
  balance: number; notes: string | null; passbook_entry_id: string | null;
};

function SavingsAdmin() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);

  const isStaff = role === "super_admin" || role === "admin" || role === "auditor";
  const canEdit = role === "super_admin" || role === "admin";
  const canDelete = role === "super_admin";

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
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["savings", memberId],
    enabled: !!memberId && isStaff,
    queryFn: async () => (await supabase.from("savings_entries").select("*").eq("member_id", memberId).order("entry_date", { ascending: true }).order("created_at", { ascending: true })).data as Entry[] ?? [],
  });

  useEffect(() => { if (!loading && role && !isStaff) navigate({ to: "/dashboard" }); }, [loading, role, isStaff, navigate]);

  if (loading || !role) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isStaff) return null;

  const latestBal = entries.at(-1)?.balance ?? 0;

  const refresh = () => qc.invalidateQueries({ queryKey: ["savings", memberId] });

  const onDelete = async (e: Entry) => {
    if (e.passbook_entry_id) return toast.error("Auto-posted from passbook — edit at source.");
    if (!confirm("Delete this savings entry? This action is logged.")) return;
    const { error } = await supabase.from("savings_entries").delete().eq("id", e.id);
    if (error) return toast.error(error.message);
    await supabase.rpc("recompute_savings_balances", { _member: memberId });
    toast.success("Entry deleted");
    refresh();
  };

  return (
    <div>
      <PageHeader title="Savings" subtitle="Member savings transactions"
        actions={canEdit && memberId ? <Button onClick={() => { setEditing(null); setOpen(true); }} className="bg-navy text-white hover:bg-navy-2">+ New Entry</Button> : undefined} />
      <Card className="p-4 mb-4">
        <Label className="text-xs uppercase tracking-wider">Member</Label>
        <Select value={memberId} onValueChange={setMemberId}>
          <SelectTrigger className="max-w-md mt-1"><SelectValue placeholder="Choose…" /></SelectTrigger>
          <SelectContent>{members.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.membership_no} · {m.full_name}</SelectItem>)}</SelectContent>
        </Select>
      </Card>
      {memberId && (
        <Card>
          <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
            <table className="w-full text-sm font-mono min-w-[820px]">
              <thead><tr className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left whitespace-nowrap">Date</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Deposit</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Bonus</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Total</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Withdrawal</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Balance</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Notes</th>
                {canEdit && <th className="px-3 py-2 whitespace-nowrap"></th>}
              </tr></thead>
              <tbody>
                {isLoading && <tr><td colSpan={canEdit ? 8 : 7} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
                {!isLoading && entries.length === 0 && <tr><td colSpan={canEdit ? 8 : 7} className="p-6 text-center text-muted-foreground">No savings</td></tr>}
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(e.entry_date)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{Number(e.amount).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{Number(e.bonus).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{Number(e.total).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-red-700 whitespace-nowrap">{Number(e.withdrawal).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-navy font-bold whitespace-nowrap">{Number(e.balance).toFixed(2)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{e.notes ?? ""}</td>
                    {canEdit && (
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {e.passbook_entry_id ? (
                          <span className="text-[9px] text-muted-foreground">Auto-posted</span>
                        ) : (
                          <>
                            <button onClick={() => { setEditing(e); setOpen(true); }} className="text-blue-600 hover:text-blue-800 mr-3" title="Edit"><Pencil className="w-4 h-4 inline" /></button>
                            {canDelete && (
                              <button onClick={() => onDelete(e)} className="text-red-600 hover:text-red-800" title="Delete"><Trash2 className="w-4 h-4 inline" /></button>
                            )}
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <SavingsDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }} memberId={memberId} latestBal={latestBal} editing={editing} onSaved={refresh} />
    </div>
  );
}

function SavingsDialog({ open, onOpenChange, memberId, latestBal, editing, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; memberId: string; latestBal: number; editing: Entry | null; onSaved: () => void;
}) {
  const [form, setForm] = useState({ entry_date: new Date().toISOString().slice(0, 10), amount: "", bonus: "", withdrawal: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        entry_date: editing.entry_date,
        amount: String(editing.amount ?? ""),
        bonus: String(editing.bonus ?? ""),
        withdrawal: String(editing.withdrawal ?? ""),
        notes: editing.notes ?? "",
      });
    } else {
      setForm({ entry_date: new Date().toISOString().slice(0, 10), amount: "", bonus: "", withdrawal: "", notes: "" });
    }
  }, [editing, open]);

  const total = Number(form.amount || 0) + Number(form.bonus || 0);
  const previewBalance = editing ? Number(editing.balance) : Number(latestBal) + total - Number(form.withdrawal || 0);

  const submit = async () => {
    setSubmitting(true);
    const payload = {
      member_id: memberId,
      entry_date: form.entry_date,
      amount: Number(form.amount || 0),
      bonus: Number(form.bonus || 0),
      total,
      withdrawal: Number(form.withdrawal || 0),
      notes: form.notes || null,
    };
    let res;
    if (editing) {
      res = await supabase.from("savings_entries").update(payload).eq("id", editing.id);
    } else {
      res = await supabase.from("savings_entries").insert({ ...payload, balance: Number(latestBal) + total - Number(form.withdrawal || 0) });
    }
    if (res.error) { setSubmitting(false); toast.error(res.error.message); return; }
    // Recompute all running balances for this member from opening balance forward.
    await supabase.rpc("recompute_savings_balances", { _member: memberId });
    setSubmitting(false);
    toast.success(editing ? "Updated" : "Saved");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">{editing ? "Edit Savings Entry" : "New Savings Entry"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Date</Label><Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></div>
          <div><Label>Deposit</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div><Label>Bonus</Label><Input type="number" step="0.01" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} /></div>
          <div className="col-span-2"><Label>Withdrawal</Label><Input type="number" step="0.01" value={form.withdrawal} onChange={(e) => setForm({ ...form, withdrawal: e.target.value })} /></div>
          <div className="col-span-2"><Label>Description / Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          {!editing && (
            <div className="col-span-2 bg-muted/50 rounded-md p-3 text-xs font-mono">New balance: <strong>{fmtKES(previewBalance)}</strong></div>
          )}
          {editing && (
            <div className="col-span-2 bg-muted/50 rounded-md p-3 text-xs font-mono text-muted-foreground">Running balances will be recalculated after save.</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-navy text-white hover:bg-navy-2">{submitting ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

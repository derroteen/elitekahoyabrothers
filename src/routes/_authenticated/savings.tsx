import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

export const Route = createFileRoute("/_authenticated/savings")({
  component: SavingsAdmin,
  head: () => ({ meta: [{ title: "Savings — EKB" }] }),
});

function SavingsAdmin() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState("");
  const [open, setOpen] = useState(false);

  const isStaff = role === "super_admin" || role === "admin" || role === "auditor";

  const { data: members = [] } = useQuery({
    queryKey: ["members-lite"],
    enabled: isStaff,
    queryFn: async () => {
      const { fetchNonMemberIds, filterMembersOnly } = await import("@/lib/member-queries");
      const [profilesRes, nonMembers] = await Promise.all([
        supabase.from("profiles").select("id, full_name, membership_no").order("membership_no"),
        fetchNonMemberIds(),
      ]);
      return filterMembersOnly(profilesRes.data ?? [], nonMembers);
    },
  });
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["savings", memberId],
    enabled: !!memberId && isStaff,
    queryFn: async () => (await supabase.from("savings_entries").select("*").eq("member_id", memberId).order("entry_date", { ascending: true })).data ?? [],
  });

  useEffect(() => { if (!loading && role && !isStaff) navigate({ to: "/dashboard" }); }, [loading, role, isStaff, navigate]);

  if (loading || !role) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isStaff) return null;
  const canEdit = role === "super_admin" || role === "admin";

  const latestBal = entries.at(-1)?.balance ?? 0;


  return (
    <div>
      <PageHeader title="Savings" subtitle="Member savings transactions"
        actions={canEdit && memberId ? <Button onClick={() => setOpen(true)} className="bg-navy text-white hover:bg-navy-2">+ New Entry</Button> : undefined} />
      <Card className="p-4 mb-4">
        <Label className="text-xs uppercase tracking-wider">Member</Label>
        <Select value={memberId} onValueChange={setMemberId}>
          <SelectTrigger className="max-w-md mt-1"><SelectValue placeholder="Choose…" /></SelectTrigger>
          <SelectContent>{members.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.membership_no} · {m.full_name}</SelectItem>)}</SelectContent>
        </Select>
      </Card>
      {memberId && (
        <Card>
          <table className="w-full text-sm font-mono">
            <thead><tr className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-right">Deposit</th>
              <th className="px-3 py-2 text-right">Bonus</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Withdrawal</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2 text-left">Notes</th>
            </tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && entries.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No savings</td></tr>}
              {entries.map((e: any) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-3 py-2">{fmtDate(e.entry_date)}</td>
                  <td className="px-3 py-2 text-right">{Number(e.amount).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(e.bonus).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-medium">{Number(e.total).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-red-700">{Number(e.withdrawal).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-navy font-bold">{Number(e.balance).toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{e.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <NewSavingsDialog open={open} onOpenChange={setOpen} memberId={memberId} latestBal={latestBal} onCreated={() => qc.invalidateQueries({ queryKey: ["savings", memberId] })} />
    </div>
  );
}

function NewSavingsDialog({ open, onOpenChange, memberId, latestBal, onCreated }: any) {
  const [form, setForm] = useState({ entry_date: new Date().toISOString().slice(0, 10), amount: "", bonus: "", withdrawal: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const total = Number(form.amount || 0) + Number(form.bonus || 0);
  const balance = Number(latestBal) + total - Number(form.withdrawal || 0);

  const submit = async () => {
    setSubmitting(true);
    const { error } = await supabase.from("savings_entries").insert({
      member_id: memberId, entry_date: form.entry_date,
      amount: Number(form.amount || 0), bonus: Number(form.bonus || 0),
      total, withdrawal: Number(form.withdrawal || 0), balance, notes: form.notes || null,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    setForm({ entry_date: new Date().toISOString().slice(0, 10), amount: "", bonus: "", withdrawal: "", notes: "" });
    onOpenChange(false); onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">New Savings Entry</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Date</Label><Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></div>
          <div><Label>Deposit</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div><Label>Bonus</Label><Input type="number" step="0.01" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} /></div>
          <div className="col-span-2"><Label>Withdrawal</Label><Input type="number" step="0.01" value={form.withdrawal} onChange={(e) => setForm({ ...form, withdrawal: e.target.value })} /></div>
          <div className="col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="col-span-2 bg-muted/50 rounded-md p-3 text-xs font-mono">New balance: <strong>{fmtKES(balance)}</strong></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-navy text-white hover:bg-navy-2">{submitting ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { PassbookTable } from "@/components/PassbookTable";

export const Route = createFileRoute("/_authenticated/passbook")({
  component: PassbookAdmin,
  head: () => ({ meta: [{ title: "Passbook — EKB" }] }),
});

function PassbookAdmin() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState<string>("");
  const [open, setOpen] = useState(false);

  if (!role || role === "member") { navigate({ to: "/" }); return null; }

  const { data: members = [] } = useQuery({
    queryKey: ["members-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, membership_no").order("membership_no");
      return data ?? [];
    },
  });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["passbook", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase.from("passbook_entries").select("*").eq("member_id", memberId).order("entry_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedMember = members.find((m: any) => m.id === memberId);
  const canEdit = role === "super_admin" || role === "admin";

  return (
    <div>
      <PageHeader title="Passbook" subtitle="Member savings ledger" actions={
        canEdit && memberId ? <Button onClick={() => setOpen(true)} className="bg-navy text-white hover:bg-navy-2">+ New Entry</Button> : undefined
      } />
      <Card className="p-4 mb-4">
        <Label className="text-xs uppercase tracking-wider">Select Member</Label>
        <Select value={memberId} onValueChange={setMemberId}>
          <SelectTrigger className="max-w-md mt-1"><SelectValue placeholder="Choose a member…" /></SelectTrigger>
          <SelectContent>
            {members.map((m: any) => (
              <SelectItem key={m.id} value={m.id}>{m.membership_no ?? "—"} · {m.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {memberId && (
        <PassbookTable entries={entries} loading={isLoading} memberName={selectedMember?.full_name} membershipNo={selectedMember?.membership_no ?? undefined} />
      )}

      <NewEntryDialog open={open} onOpenChange={setOpen} memberId={memberId} latestBalance={entries.at(-1)?.balance ?? 0} latestLoanBal={entries.at(-1)?.loan_balance ?? 0} onCreated={() => qc.invalidateQueries({ queryKey: ["passbook", memberId] })} />
    </div>
  );
}

function NewEntryDialog({ open, onOpenChange, memberId, latestBalance, latestLoanBal, onCreated }: any) {
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    savings: "", bonus: "", withdrawal: "", loan_payment: "", remarks: "", treasurer_sign: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const total = Number(form.savings || 0) + Number(form.bonus || 0);
  const balance = Number(latestBalance) + total - Number(form.withdrawal || 0);
  const loanBalance = Math.max(0, Number(latestLoanBal) - Number(form.loan_payment || 0));

  const submit = async () => {
    setSubmitting(true);
    const { error } = await supabase.from("passbook_entries").insert({
      member_id: memberId,
      entry_date: form.entry_date,
      savings: Number(form.savings || 0),
      bonus: Number(form.bonus || 0),
      total, withdrawal: Number(form.withdrawal || 0), balance,
      loan_payment: Number(form.loan_payment || 0), loan_balance: loanBalance,
      remarks: form.remarks || null,
      treasurer_sign: form.treasurer_sign || null,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Entry recorded");
    setForm({ entry_date: new Date().toISOString().slice(0, 10), savings: "", bonus: "", withdrawal: "", loan_payment: "", remarks: "", treasurer_sign: "" });
    onOpenChange(false); onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-serif">New Passbook Entry</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Date</Label><Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></div>
          <div><Label>Savings</Label><Input type="number" step="0.01" value={form.savings} onChange={(e) => setForm({ ...form, savings: e.target.value })} /></div>
          <div><Label>Bonus</Label><Input type="number" step="0.01" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} /></div>
          <div><Label>Withdrawal</Label><Input type="number" step="0.01" value={form.withdrawal} onChange={(e) => setForm({ ...form, withdrawal: e.target.value })} /></div>
          <div><Label>Loan Payment</Label><Input type="number" step="0.01" value={form.loan_payment} onChange={(e) => setForm({ ...form, loan_payment: e.target.value })} /></div>
          <div className="col-span-2"><Label>Remarks</Label><Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div>
          <div className="col-span-2"><Label>Treasurer Sign</Label><Input value={form.treasurer_sign} onChange={(e) => setForm({ ...form, treasurer_sign: e.target.value })} /></div>
          <div className="col-span-2 bg-muted/50 rounded-md p-3 text-xs space-y-1 font-mono">
            <div>Total = savings + bonus: <strong>{fmtKES(total)}</strong></div>
            <div>New Balance: <strong>{fmtKES(balance)}</strong></div>
            <div>Loan Balance: <strong>{fmtKES(loanBalance)}</strong></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-navy text-white hover:bg-navy-2">{submitting ? "Saving…" : "Save Entry"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

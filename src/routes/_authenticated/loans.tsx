import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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

export const Route = createFileRoute("/_authenticated/loans")({
  component: LoansAdmin,
  head: () => ({ meta: [{ title: "Loans — EKB" }] }),
});

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  paid: "bg-gray-100 text-gray-700",
  overdue: "bg-red-100 text-red-700",
  rejected: "bg-red-50 text-red-700",
};

function LoansAdmin() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [repayFor, setRepayFor] = useState<any>(null);

  if (!role || role === "member") { navigate({ to: "/" }); return null; }
  const canEdit = role === "super_admin" || role === "admin";

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["loans-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loans")
        .select("*, profiles!loans_member_id_fkey(full_name, membership_no)")
        .order("created_at", { ascending: false });
      if (error) {
        // fallback if FK alias missing
        const { data: d2 } = await supabase.from("loans").select("*").order("created_at", { ascending: false });
        return d2 ?? [];
      }
      return data ?? [];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: any }) => {
      const { error } = await supabase.from("loans").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Loan updated"); qc.invalidateQueries({ queryKey: ["loans-all"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Loans" subtitle={`${loans.length} loans on file`}
        actions={canEdit ? <Button onClick={() => setOpen(true)} className="bg-navy text-white hover:bg-navy-2">+ New Loan</Button> : undefined} />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3 text-right">Borrowed</th>
              <th className="px-4 py-3 text-right">Paid</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Freq</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && loans.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No loans</td></tr>}
            {loans.map((l: any) => (
              <tr key={l.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{l.profiles?.full_name ?? l.member_id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground font-mono">{l.profiles?.membership_no}</div>
                </td>
                <td className="px-4 py-3 text-right font-mono">{fmtKES(l.amount_borrowed)}</td>
                <td className="px-4 py-3 text-right font-mono">{fmtKES(l.amount_paid)}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-navy">{fmtKES(l.balance)}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(l.loan_date)}</td>
                <td className="px-4 py-3 text-xs capitalize">{l.payment_frequency}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[l.status] ?? "bg-gray-100 text-gray-700"}`}>{l.status}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  {canEdit && l.status === "pending" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: l.id, status: "approved" })}>Approve</Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: l.id, status: "rejected" })}>Reject</Button>
                    </>
                  )}
                  {canEdit && (l.status === "approved" || l.status === "active" || l.status === "overdue") && (
                    <Button size="sm" variant="ghost" onClick={() => setRepayFor(l)}>Repayment</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <NewLoanDialog open={open} onOpenChange={setOpen} onCreated={() => qc.invalidateQueries({ queryKey: ["loans-all"] })} />
      {repayFor && <RepaymentDialog loan={repayFor} onClose={() => setRepayFor(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["loans-all"] })} />}
    </div>
  );
}

function NewLoanDialog({ open, onOpenChange, onCreated }: any) {
  const { data: members = [] } = useQuery({
    queryKey: ["members-lite"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, membership_no").order("membership_no")).data ?? [],
  });
  const [form, setForm] = useState({ member_id: "", amount: "", interest: "10", freq: "monthly", insurance: "0", date: new Date().toISOString().slice(0, 10), notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.member_id || !form.amount) { toast.error("Member and amount required"); return; }
    setSubmitting(true);
    const amount = Number(form.amount);
    const interestAmt = amount * (Number(form.interest) / 100);
    const balance = amount + interestAmt + Number(form.insurance || 0);
    const { error } = await supabase.from("loans").insert({
      member_id: form.member_id,
      amount_borrowed: amount,
      interest_rate: Number(form.interest),
      payment_frequency: form.freq as any,
      insurance: Number(form.insurance || 0),
      balance,
      loan_date: form.date,
      notes: form.notes || null,
      status: "pending",
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Loan created (pending)");
    onOpenChange(false); onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">New Loan</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Member</Label>
            <Select value={form.member_id} onValueChange={(v) => setForm({ ...form, member_id: v })}>
              <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>{members.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.membership_no} · {m.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount (KES)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div><Label>Interest %</Label><Input type="number" step="0.1" value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })} /></div>
            <div><Label>Insurance</Label><Input type="number" step="0.01" value={form.insurance} onChange={(e) => setForm({ ...form, insurance: e.target.value })} /></div>
            <div>
              <Label>Frequency</Label>
              <Select value={form.freq} onValueChange={(v) => setForm({ ...form, freq: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Loan Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-navy text-white hover:bg-navy-2">{submitting ? "Saving…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RepaymentDialog({ loan, onClose, onSaved }: any) {
  const [form, setForm] = useState({ amount: "", penalty: "0", payment_date: new Date().toISOString().slice(0, 10), notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.amount) { toast.error("Amount required"); return; }
    setSubmitting(true);
    const amount = Number(form.amount);
    const penalty = Number(form.penalty || 0);
    const { error: e1 } = await supabase.from("loan_repayments").insert({
      loan_id: loan.id, amount, penalty,
      payment_date: form.payment_date, notes: form.notes || null,
    });
    if (e1) { setSubmitting(false); toast.error(e1.message); return; }
    const newPaid = Number(loan.amount_paid) + amount;
    const newBal = Math.max(0, Number(loan.balance) - amount);
    const newStatus = newBal === 0 ? "paid" : (loan.status === "approved" ? "active" : loan.status);
    const { error: e2 } = await supabase.from("loans").update({ amount_paid: newPaid, balance: newBal, status: newStatus }).eq("id", loan.id);
    setSubmitting(false);
    if (e2) { toast.error(e2.message); return; }
    toast.success("Repayment recorded");
    onClose(); onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">Record Repayment</DialogTitle></DialogHeader>
        <div className="text-xs text-muted-foreground mb-3 font-mono">Current balance: {fmtKES(loan.balance)}</div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Amount</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div><Label>Penalty</Label><Input type="number" step="0.01" value={form.penalty} onChange={(e) => setForm({ ...form, penalty: e.target.value })} /></div>
          <div className="col-span-2"><Label>Date</Label><Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} /></div>
          <div className="col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-navy text-white hover:bg-navy-2">{submitting ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

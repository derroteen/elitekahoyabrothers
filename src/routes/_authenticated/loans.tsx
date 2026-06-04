import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { calcLoan, buildSchedule, type Frequency } from "@/lib/loan-calc";

export const Route = createFileRoute("/_authenticated/loans")({
  component: LoansAdmin,
  head: () => ({ meta: [{ title: "Loans — EKB" }] }),
});

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  paid: "bg-gray-100 text-gray-700",
  completed: "bg-gray-100 text-gray-700",
  overdue: "bg-red-100 text-red-700",
  rejected: "bg-red-50 text-red-700",
};

function LoansAdmin() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [repayFor, setRepayFor] = useState<any>(null);
  const [scheduleFor, setScheduleFor] = useState<any>(null);

  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!role) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (role === "member") { navigate({ to: "/" }); return null; }
  const canEdit = role === "super_admin" || role === "admin";

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["loans-all"],
    queryFn: async () => {
      const [{ data: ls }, { data: profs }] = await Promise.all([
        supabase.from("loans").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, membership_no"),
      ]);
      const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return (ls ?? []).map((l: any) => ({ ...l, profile: pmap.get(l.member_id) }));
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
      <PageHeader title="Loan Register" subtitle={`${loans.length} loans on file`}
        actions={canEdit ? <Button onClick={() => setOpen(true)} size="lg" className="bg-navy text-white hover:bg-navy-2 shadow-md">+ New Loan</Button> : undefined} />
      {canEdit && (
        <div className="mb-4 flex justify-end sm:hidden">
          <Button onClick={() => setOpen(true)} className="bg-navy text-white hover:bg-navy-2 w-full">+ New Loan</Button>
        </div>
      )}
      <Card>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Member</th>
                <th className="px-3 py-3 text-right">Borrowed</th>
                <th className="px-3 py-3 text-right">Rate</th>
                <th className="px-3 py-3 text-right">Term</th>
                <th className="px-3 py-3">Freq</th>
                <th className="px-3 py-3 text-right">Per Period</th>
                <th className="px-3 py-3 text-right">Insurance</th>
                <th className="px-3 py-3 text-right">Total Repay</th>
                <th className="px-3 py-3 text-right">Paid</th>
                <th className="px-3 py-3 text-right">Balance</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={13} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && loans.length === 0 && <tr><td colSpan={13} className="p-6 text-center text-muted-foreground">No loans yet</td></tr>}
              {loans.map((l: any) => (
                <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(l.loan_date)}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{l.profile?.full_name ?? l.member_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground font-mono">{l.profile?.membership_no}</div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{fmtKES(l.amount_borrowed)}</td>
                  <td className="px-3 py-3 text-right">{Number(l.interest_rate).toFixed(1)}%</td>
                  <td className="px-3 py-3 text-right">{l.loan_term_months}m</td>
                  <td className="px-3 py-3 text-xs capitalize">{l.payment_frequency}</td>
                  <td className="px-3 py-3 text-right font-mono">{fmtKES(l.period_payment)}</td>
                  <td className="px-3 py-3 text-right font-mono">{fmtKES(l.insurance)}</td>
                  <td className="px-3 py-3 text-right font-mono">{fmtKES(l.total_repayable)}</td>
                  <td className="px-3 py-3 text-right font-mono">{fmtKES(l.amount_paid)}</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-navy">{fmtKES(l.balance)}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[l.status] ?? "bg-gray-100 text-gray-700"}`}>{l.status}</span>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setScheduleFor(l)}>Schedule</Button>
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
        </div>
      </Card>
      <NewLoanDialog open={open} onOpenChange={setOpen} onCreated={() => qc.invalidateQueries({ queryKey: ["loans-all"] })} />
      {repayFor && <RepaymentDialog loan={repayFor} onClose={() => setRepayFor(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["loans-all"] })} />}
      {scheduleFor && <ScheduleDialog loan={scheduleFor} onClose={() => setScheduleFor(null)} />}
    </div>
  );
}

function NewLoanDialog({ open, onOpenChange, onCreated }: any) {
  const { data: members = [] } = useQuery({
    queryKey: ["members-lite"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, membership_no").order("membership_no")).data ?? [],
  });
  const [form, setForm] = useState({
    member_id: "", amount: "", interest: "10", freq: "monthly" as Frequency,
    term: "12", customTerm: "", date: new Date().toISOString().slice(0, 10), notes: "", purpose: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const selectedMember = members.find((m: any) => m.id === form.member_id);
  const effectiveTerm = form.term === "custom" ? Number(form.customTerm || 0) : Number(form.term || 0);
  const calc = useMemo(() => calcLoan(Number(form.amount || 0), Number(form.interest || 0), effectiveTerm, form.freq), [form.amount, form.interest, effectiveTerm, form.freq]);


  const submit = async () => {
    if (!form.member_id || !form.amount) { toast.error("Member and amount required"); return; }
    if (!effectiveTerm || effectiveTerm < 1) { toast.error("Valid payment period required"); return; }
    setSubmitting(true);
    const purposeNote = form.purpose ? `Purpose: ${form.purpose}${form.notes ? ` · ${form.notes}` : ""}` : (form.notes || null);
    const { data: loan, error } = await supabase.from("loans").insert({
      member_id: form.member_id,
      amount_borrowed: calc.principal,
      interest_rate: calc.interestRate,
      payment_frequency: form.freq as any,
      loan_term_months: calc.termMonths,
      insurance: calc.insurance,
      total_repayable: calc.totalRepayable,
      period_payment: calc.periodPayment,
      balance: calc.totalRepayable,
      loan_date: form.date,
      notes: purposeNote,
      status: "pending",
    } as any).select("id").single();
    if (error) { setSubmitting(false); toast.error(error.message); return; }


    // Auto-generate repayment schedule
    const rows = buildSchedule(form.date, calc).map(r => ({ ...r, loan_id: loan!.id, status: "pending" }));
    await (supabase.from("loan_schedule" as any) as any).insert(rows);

    setSubmitting(false);
    toast.success(`Loan created · ${calc.periods} ${form.freq === "weekly" ? "weekly" : "monthly"} payments of ${fmtKES(calc.periodPayment)}`);
    onOpenChange(false); onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="font-serif">New Loan</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Member</Label>
            <Select value={form.member_id} onValueChange={(v) => setForm({ ...form, member_id: v })}>
              <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>{members.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.membership_no} · {m.full_name}</SelectItem>)}</SelectContent>
            </Select>
            {selectedMember && <div className="text-xs text-muted-foreground mt-1 font-mono">Membership No: {selectedMember.membership_no}</div>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount Borrowed (KES)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div><Label>Interest Rate % (annual)</Label><Input type="number" step="0.1" value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })} /></div>
            <div>
              <Label>Payment Period</Label>
              <Select value={form.term} onValueChange={(v) => setForm({ ...form, term: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 Months</SelectItem>
                  <SelectItem value="6">6 Months</SelectItem>
                  <SelectItem value="12">12 Months</SelectItem>
                  <SelectItem value="24">24 Months</SelectItem>
                  <SelectItem value="custom">Custom…</SelectItem>
                </SelectContent>
              </Select>
              {form.term === "custom" && (
                <Input className="mt-2" type="number" min="1" placeholder="Months" value={form.customTerm} onChange={(e) => setForm({ ...form, customTerm: e.target.value })} />
              )}
            </div>
            <div>
              <Label>Frequency</Label>
              <Select value={form.freq} onValueChange={(v: Frequency) => setForm({ ...form, freq: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Loan Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="col-span-2"><Label>Loan Purpose (optional)</Label><Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="e.g. School fees, business capital" /></div>
            <div className="col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>


          <div className="bg-muted/40 rounded-md p-4 text-sm grid grid-cols-2 gap-x-6 gap-y-1.5">
            <div className="text-muted-foreground">Principal + Compound Interest:</div>
            <div className="text-right font-mono">{fmtKES(calc.withInterest)}</div>
            <div className="text-muted-foreground">Insurance:</div>
            <div className="text-right font-mono">{fmtKES(calc.insurance)}</div>
            <div className="text-muted-foreground font-medium">Total Repayable:</div>
            <div className="text-right font-mono font-bold">{fmtKES(calc.totalRepayable)}</div>
            <div className="text-muted-foreground">{calc.periods} × {form.freq === "weekly" ? "weekly" : "monthly"} payment:</div>
            <div className="text-right font-mono font-bold text-navy">{fmtKES(calc.periodPayment)}</div>
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
    const newStatus = newBal === 0 ? "completed" : (loan.status === "approved" ? "active" : loan.status);
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

function ScheduleDialog({ loan, onClose }: any) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["loan-schedule", loan.id],
    queryFn: async () => {
      const { data } = await (supabase.from("loan_schedule" as any) as any).select("*").eq("loan_id", loan.id).order("period_number");
      return (data ?? []) as any[];
    },
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle className="font-serif">Repayment Schedule · {loan.profile?.full_name ?? loan.member_id.slice(0,8)}</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
              <tr>
                <th className="px-2 py-2">#</th><th className="px-2 py-2">Due</th>
                <th className="px-2 py-2 text-right">Expected</th>
                <th className="px-2 py-2 text-right">Paid</th>
                <th className="px-2 py-2 text-right">Balance</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No schedule generated</td></tr>}
              {rows.map((r: any) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-2 py-2 font-mono">{r.period_number}</td>
                  <td className="px-2 py-2">{fmtDate(r.due_date)}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmtKES(r.expected_amount)}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmtKES(r.amount_paid)}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmtKES(r.balance_remaining)}</td>
                  <td className="px-2 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-700"}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter><Button onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

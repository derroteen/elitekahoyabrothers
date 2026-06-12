import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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

export const Route = createFileRoute("/_authenticated/loans/")({
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
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [removeFinesFor, setRemoveFinesFor] = useState<any>(null);
  const [rejectFor, setRejectFor] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["loans-all"],
    enabled: !!role && role !== "member",
    queryFn: async () => {
      const [{ data: ls }, { data: profs }] = await Promise.all([
        supabase.from("loans").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, membership_no"),
      ]);
      const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return (ls ?? []).map((l: any) => ({ ...l, profile: pmap.get(l.member_id) }));
    },
  });

  const applyFines = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("apply_loan_fines", { _loan_id: null });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => { toast.success(`${n} fine(s) charged`); qc.invalidateQueries({ queryKey: ["loans-all"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const approveLoan = useMutation({
    mutationFn: async (loan: any) => {
      const { error } = await supabase.from("loans")
        .update({ status: "approved" } as any).eq("id", loan.id);
      if (error) throw error;
      await supabase.from("audit_logs").insert({
        actor_id: user?.id ?? null, action: "approve_loan", table_name: "loans",
        record_id: loan.id, old_value: { status: loan.status } as any,
        new_value: { status: "approved" } as any,
        reason: `Approved loan for ${loan.profile?.full_name ?? loan.member_id}`,
      } as any);
      await supabase.from("notifications").insert({
        user_id: loan.member_id, title: "Loan Approved",
        message: `Your loan of ${fmtKES(loan.amount_borrowed)} has been approved.`,
        type: "loan",
      } as any);
    },
    onSuccess: () => { toast.success("Loan approved"); qc.invalidateQueries({ queryKey: ["loans-all"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const rejectLoan = useMutation({
    mutationFn: async ({ loan, reason }: { loan: any; reason: string }) => {
      const stamp = new Date().toISOString();
      const note = `[REJECTED ${stamp}]${reason ? ` ${reason}` : ""}${loan.notes ? `\n---\n${loan.notes}` : ""}`;
      const { error } = await supabase.from("loans")
        .update({ status: "rejected", notes: note } as any).eq("id", loan.id);
      if (error) throw error;
      await (supabase.from("loan_schedule" as any) as any).delete().eq("loan_id", loan.id);
      await supabase.from("audit_logs").insert({
        actor_id: user?.id ?? null, action: "reject_loan", table_name: "loans",
        record_id: loan.id, old_value: { status: loan.status } as any,
        new_value: { status: "rejected", reason } as any,
        reason: `Rejected loan for ${loan.profile?.full_name ?? loan.member_id}`,
      } as any);
      await supabase.from("notifications").insert({
        user_id: loan.member_id, title: "Loan Rejected",
        message: `Your loan application of ${fmtKES(loan.amount_borrowed)} was rejected.${reason ? ` Reason: ${reason}` : ""}`,
        type: "loan",
      } as any);
    },
    onSuccess: () => {
      toast.success("Loan rejected");
      qc.invalidateQueries({ queryKey: ["loans-all"] });
      setRejectFor(null); setRejectReason("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeFines = useMutation({
    mutationFn: async (loan: any) => {
      const { data: fines } = await (supabase.from("loan_fines" as any) as any)
        .select("id, amount, amount_paid").eq("loan_id", loan.id).in("status", ["unpaid", "partial"]);
      const totalWaived = (fines ?? []).reduce((s: number, f: any) => s + (Number(f.amount) - Number(f.amount_paid || 0)), 0);
      if ((fines ?? []).length) {
        await (supabase.from("loan_fines" as any) as any)
          .update({ status: "waived" }).in("id", (fines as any[]).map((f) => f.id));
      }
      await supabase.from("loans").update({ outstanding_fines: 0 } as any).eq("id", loan.id);
      await (supabase.from("loan_schedule" as any) as any)
        .update({ fine_amount: 0 }).eq("loan_id", loan.id);
      await supabase.from("audit_logs").insert({
        actor_id: user?.id ?? null, action: "remove_fines", table_name: "loans",
        record_id: loan.id,
        old_value: { outstanding_fines: Number(loan.outstanding_fines || 0) } as any,
        new_value: { outstanding_fines: 0, waived: totalWaived } as any,
        reason: `Removed fines for ${loan.profile?.full_name ?? loan.member_id}`,
      } as any);
      return totalWaived;
    },
    onSuccess: (waived) => {
      toast.success(`Fines removed (${fmtKES(waived)} waived)`);
      qc.invalidateQueries({ queryKey: ["loans-all"] });
      setRemoveFinesFor(null);
    },
    onError: (e: any) => { toast.error(e.message); setRemoveFinesFor(null); },
  });

  useEffect(() => { if (!loading && role === "member") navigate({ to: "/dashboard" }); }, [loading, role, navigate]);

  if (loading || !role) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (role === "member") return null;
  const canEdit = role === "super_admin" || role === "admin";

  return (
    <div>
      <PageHeader title="Member Loans" subtitle={`${loans.length} loans on file`}
        actions={canEdit ? (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => applyFines.mutate()} disabled={applyFines.isPending}>Apply Fines</Button>
            <Button onClick={() => setOpen(true)} size="lg" className="bg-navy text-white hover:bg-navy-2 shadow-md">+ New Loan</Button>
          </div>
        ) : undefined} />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-3 py-3">Member</th>
                <th className="px-3 py-3">Loan Date</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Outstanding Balance</th>
                <th className="px-3 py-3 text-right">Outstanding Fines</th>
                <th className="px-3 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && loans.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No loans yet</td></tr>}
              {loans.map((l: any) => {
                const cleared = Number(l.balance || 0) < 5;
                const hasFines = Number(l.outstanding_fines || 0) > 0;
                return (
                  <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-3">
                      <div className="font-medium text-navy">{l.profile?.full_name ?? l.member_id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground font-mono">{l.profile?.membership_no}</div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(l.loan_date)}</td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${cleared ? "bg-emerald-100 text-emerald-700 font-bold" : (STATUS_COLORS[l.status] ?? "bg-gray-100 text-gray-700")}`}>
                        {cleared ? "CLEARED" : l.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-navy">{fmtKES(l.balance)}</td>
                    <td className={`px-3 py-3 text-right font-mono ${hasFines ? "text-red-600 font-bold" : "text-muted-foreground"}`}>{fmtKES(l.outstanding_fines ?? 0)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        type="button"
                        className="bg-navy text-white hover:bg-navy-2"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!l?.id) { toast.error("Missing loan id"); return; }
                          navigate({ to: "/loans/$loanId", params: { loanId: String(l.id) } });
                        }}
                      >
                        View Ledger
                      </Button>
                      {canEdit && l.status === "pending" && (
                        <>
                          <Button size="sm" type="button" className="bg-emerald-600 text-white hover:bg-emerald-700 ml-1"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); approveLoan.mutate(l); }} disabled={approveLoan.isPending}>
                            Approve
                          </Button>
                          <Button size="sm" type="button" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 ml-1"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRejectFor(l); setRejectReason(""); }}>
                            Reject
                          </Button>
                        </>
                      )}
                      {canEdit && hasFines && (
                        <Button size="sm" type="button" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-1"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRemoveFinesFor(l); }}>
                          Remove Fines
                        </Button>
                      )}
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <NewLoanDialog open={open} onOpenChange={setOpen} onCreated={() => qc.invalidateQueries({ queryKey: ["loans-all"] })} />

      <Dialog open={!!removeFinesFor} onOpenChange={(o) => !o && setRemoveFinesFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-serif">Remove Fines</DialogTitle></DialogHeader>
          <p className="text-sm">
            Are you sure you want to remove fines for <span className="font-medium">{removeFinesFor?.profile?.full_name}</span>?
            This will waive <span className="font-mono font-bold">{fmtKES(removeFinesFor?.outstanding_fines ?? 0)}</span> of outstanding penalties.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveFinesFor(null)}>Cancel</Button>
            <Button className="bg-red-600 text-white hover:bg-red-700" onClick={() => removeFines.mutate(removeFinesFor)} disabled={removeFines.isPending}>
              {removeFines.isPending ? "Removing…" : "Remove Fines"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-serif">Reject Loan</DialogTitle></DialogHeader>
          <p className="text-sm">
            Reject loan application from <span className="font-medium">{rejectFor?.profile?.full_name}</span> for{" "}
            <span className="font-mono font-bold">{fmtKES(rejectFor?.amount_borrowed ?? 0)}</span>?
          </p>
          <div>
            <Label>Rejection reason (optional)</Label>
            <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Insufficient savings" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => rejectLoan.mutate({ loan: rejectFor, reason: rejectReason })} disabled={rejectLoan.isPending}>
              {rejectLoan.isPending ? "Rejecting…" : "Reject Loan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function NewLoanDialog({ open, onOpenChange, onCreated }: any) {
  const { data: members = [] } = useQuery({
    queryKey: ["members-lite"],
    queryFn: async () => {
      const { fetchNonMemberIds, filterMembersOnly } = await import("@/lib/member-queries");
      const [profilesRes, nonMembers] = await Promise.all([
        supabase.from("profiles").select("id, full_name, membership_no").order("sort_order", { ascending: true, nullsFirst: false }).order("membership_no"),
        fetchNonMemberIds(),
      ]);
      return filterMembersOnly(profilesRes.data ?? [], nonMembers);
    },
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
    const startDate = new Date(form.date); startDate.setMonth(startDate.getMonth() + 1);
    const { data: loan, error } = await supabase.from("loans").insert({
      member_id: form.member_id,
      amount_borrowed: calc.principal,
      interest_rate: calc.interestRate,
      payment_frequency: form.freq as any,
      loan_term_months: calc.termMonths,
      insurance: calc.insurance,
      insurance_balance: calc.insurance,
      insurance_paid: 0,
      total_repayable: calc.totalRepayable,
      period_payment: calc.periodPayment,
      balance: calc.totalRepayable,
      loan_date: form.date,
      payment_start_date: startDate.toISOString().slice(0, 10),
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
            <div className="text-muted-foreground">Principal:</div>
            <div className="text-right font-mono">{fmtKES(calc.principal)}</div>
            <div className="text-muted-foreground">Interest (simple, {calc.interestRate}% p.a.):</div>
            <div className="text-right font-mono">{fmtKES(calc.interest)}</div>
            <div className="text-muted-foreground font-medium">Total Payable (Loan + Interest):</div>
            <div className="text-right font-mono font-bold">{fmtKES(calc.totalRepayable)}</div>
            <div className="text-muted-foreground">{calc.periods} × {form.freq === "weekly" ? "weekly" : "monthly"} payment:</div>
            <div className="text-right font-mono font-bold text-navy">{fmtKES(calc.periodPayment)}</div>
            <div className="col-span-2 border-t border-border my-1" />
            <div className="text-muted-foreground">Insurance (separate ledger):</div>
            <div className="text-right font-mono">{fmtKES(calc.insurance)}</div>
            <div className="text-muted-foreground">Payment Start Date:</div>
            <div className="text-right font-mono">{(() => { const d = new Date(form.date); d.setMonth(d.getMonth()+1); return fmtDate(d); })()}</div>
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
  const [form, setForm] = useState({
    amount: "",
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: "cash",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const required = Number(loan.period_payment || 0);
  const amt = Number(form.amount || 0);
  const outFines = Number(loan.outstanding_fines || 0);
  const previewFinePaid = Math.min(amt, outFines);
  const previewExcess = Math.max(0, amt - outFines - required);

  const submit = async () => {
    if (!form.amount) { toast.error("Amount required"); return; }
    setSubmitting(true);
    const { data, error } = await (supabase as any).rpc("record_loan_repayment", {
      _loan_id: loan.id,
      _amount: Number(form.amount),
      _payment_date: form.payment_date,
      _notes: form.notes || null,
      _payment_method: form.payment_method,
      _source: "manual",
      _weekly_entry_id: null,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    const r = data as any;
    toast.success(`Repayment recorded · ${r.installments_covered ?? 0} installment(s) covered${r.fine_paid > 0 ? `, ${fmtKES(r.fine_paid)} fines paid` : ""}`);
    onClose(); onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">Manual Loan Repayment</DialogTitle></DialogHeader>
        <div className="text-xs text-muted-foreground mb-3 font-mono space-y-0.5">
          <div>Member: <span className="text-foreground">{loan.profile?.full_name} · {loan.profile?.membership_no}</span></div>
          <div>Required per period: {fmtKES(required)}</div>
          <div>Current balance: {fmtKES(loan.balance)}</div>
          {outFines > 0 && <div className="text-red-600">Outstanding fines: {fmtKES(outFines)}</div>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Amount Paid</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div><Label>Payment Date</Label><Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} /></div>
          <div className="col-span-2">
            <Label>Payment Method</Label>
            <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="mpesa">M-Pesa</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. outside-meeting payment, correction, bulk payment" /></div>
        </div>
        {amt > 0 && (
          <div className="bg-muted/40 rounded-md p-3 text-xs space-y-1">
            {previewFinePaid > 0 && <div>Fines covered: <span className="font-mono">{fmtKES(previewFinePaid)}</span></div>}
            {previewExcess > 0 && <div className="text-emerald-700">Excess (prepays future): <span className="font-mono">{fmtKES(previewExcess)}</span></div>}
            <div className="text-muted-foreground">Allocation order: outstanding fines → current installments → future installments (prepaid)</div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-navy text-white hover:bg-navy-2">{submitting ? "Saving…" : "Record Payment"}</Button>
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

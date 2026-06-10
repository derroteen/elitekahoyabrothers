import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtKES, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/loans/$loanId")({
  component: LoanLedger,
  head: () => ({ meta: [{ title: "Loan Ledger — EKB" }] }),
});

function addMonths(d: string, n: number) {
  const dt = new Date(d); dt.setMonth(dt.getMonth() + n);
  return dt.toISOString().slice(0, 10);
}

function LoanLedger() {
  const { loanId } = Route.useParams();
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [insOpen, setInsOpen] = useState(false);

  const { data: loan } = useQuery({
    queryKey: ["loan", loanId],
    enabled: !!user,
    queryFn: async () => {
      const { data: l } = await supabase.from("loans").select("*").eq("id", loanId).maybeSingle();
      if (!l) return null;
      const { data: profile } = await supabase.from("profiles").select("id, full_name, membership_no, email, phone").eq("id", l.member_id).maybeSingle();
      return { ...l, profile };
    },
  });

  const { data: schedule = [] } = useQuery({
    queryKey: ["loan-schedule", loanId],
    enabled: !!user,
    queryFn: async () => (await (supabase.from("loan_schedule" as any) as any).select("*").eq("loan_id", loanId).order("period_number")).data ?? [],
  });

  const { data: repayments = [] } = useQuery({
    queryKey: ["loan-repayments", loanId],
    enabled: !!user,
    queryFn: async () => (await supabase.from("loan_repayments").select("*").eq("loan_id", loanId).order("payment_date")).data ?? [],
  });

  const { data: insurance = [] } = useQuery({
    queryKey: ["loan-insurance", loanId],
    enabled: !!user,
    queryFn: async () => (await (supabase.from("loan_insurance_payments" as any) as any).select("*").eq("loan_id", loanId).order("payment_date")).data ?? [],
  });

  const { data: fines = [] } = useQuery({
    queryKey: ["loan-fines", loanId],
    enabled: !!user,
    queryFn: async () => (await (supabase.from("loan_fines" as any) as any).select("*").eq("loan_id", loanId).order("fine_date")).data ?? [],
  });

  if (!loan) return <div className="p-8 text-muted-foreground">Loading…</div>;

  const isStaff = role === "super_admin" || role === "admin" || role === "auditor";
  const canEdit = role === "super_admin" || role === "admin";
  const backTo = isStaff ? "/loans" : "/my-loans";

  const principal = Number(loan.amount_borrowed || 0);
  const months = Number(loan.loan_term_months || 0);
  const rate = Number(loan.interest_rate || 0);
  const interest = principal * (rate / 100) * (months / 12);
  const totalPayable = Number(loan.total_repayable ?? principal + interest);
  const balance = Number(loan.balance ?? 0);
  const insBalance = Number(loan.insurance_balance ?? loan.insurance ?? 0);
  const insPaid = Number(loan.insurance_paid ?? 0);
  const insTotal = Number(loan.insurance ?? 0);
  const startDate = loan.payment_start_date ?? addMonths(loan.loan_date, 1);

  const loanCleared = balance < 5;
  const insCleared = insBalance < 5;

  // Build a running loan-payment ledger (Date / Amount Paid / Balance / Penalty)
  let running = totalPayable;
  const loanRows = repayments.map((r: any) => {
    const principalPart = Number(r.principal_paid ?? r.amount ?? 0);
    running = Math.max(0, running - principalPart);
    return {
      id: r.id,
      date: r.payment_date,
      amount: principalPart,
      penalty: Number(r.fine_paid ?? 0),
      balance: running,
      source: r.source,
      notes: r.notes,
    };
  });

  // Build insurance ledger
  const insRows = insurance.map((i: any) => ({
    id: i.id, date: i.payment_date, amount: Number(i.amount), balance: Number(i.balance_after), notes: i.notes,
  }));

  return (
    <div className="relative">
      <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy mb-3">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>
      <PageHeader title={`Loan Ledger — ${loan.profile?.full_name ?? ""}`} subtitle={loan.profile?.membership_no ?? ""} />

      {/* Loan Details */}
      <Card className="mb-4 relative overflow-hidden">
        {loanCleared && <Watermark text="CLEARED" />}
        <div className="p-4 border-b border-border font-serif text-lg">Loan Details</div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Stat label="Loan Date" value={fmtDate(loan.loan_date)} />
          <Stat label="Amount Borrowed" value={fmtKES(principal)} />
          <Stat label="Interest Rate" value={`${rate.toFixed(1)}% p.a.`} />
          <Stat label="Frequency" value={loan.payment_frequency} />
          <Stat label="Total Payment (P+I)" value={fmtKES(totalPayable)} />
          <Stat label="Per Period" value={fmtKES(loan.period_payment)} />
          <Stat label="Period of Payment" value={`${months} months`} />
          <Stat label="Payment Start Date" value={fmtDate(startDate)} />
          <Stat label="Total Paid (loan)" value={fmtKES(loan.amount_paid)} />
          <Stat label="Outstanding Balance" value={fmtKES(balance)} highlight />
          <Stat label="Outstanding Fines" value={fmtKES(loan.outstanding_fines ?? 0)} highlight={Number(loan.outstanding_fines) > 0} />
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Status</div>
            <div className="mt-1 text-sm font-medium">{loanCleared ? "CLEARED" : (loan.status ?? "").replace(/_/g, " ")}</div>
          </div>
        </div>
      </Card>

      {/* Insurance Details */}
      <Card className="mb-4 relative overflow-hidden">
        {insCleared && <Watermark text="PAID IN FULL" color="blue" />}
        <div className="p-4 border-b border-border font-serif text-lg flex items-center justify-between">
          <span>Insurance (separate from loan)</span>
          {canEdit && !insCleared && <Button size="sm" onClick={() => setInsOpen(true)} className="bg-navy text-white hover:bg-navy-2">+ Insurance Payment</Button>}
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Stat label="Total Insurance" value={fmtKES(insTotal)} />
          <Stat label="Insurance Paid" value={fmtKES(insPaid)} />
          <Stat label="Insurance Balance" value={fmtKES(insBalance)} highlight />
          <Stat label="Status" value={insCleared ? "PAID IN FULL" : "Outstanding"} />
        </div>
      </Card>

      {/* Loan payment table */}
      <Card className="mb-4 relative overflow-hidden">
        {loanCleared && <Watermark text="CLEARED" />}
        <div className="p-4 border-b border-border font-serif text-lg">Loan Payment Table</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2 text-right">Amount Paid</th>
                <th className="px-3 py-2 text-right">Remaining Balance</th>
                <th className="px-3 py-2 text-right">Penalty</th>
                <th className="px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {loanRows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No loan payments yet</td></tr>}
              {loanRows.map((r: any) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{fmtDate(r.date)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(r.amount)}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{fmtKES(r.balance)}</td>
                  <td className="px-3 py-2 text-right font-mono text-red-600">{fmtKES(r.penalty)}</td>
                  <td className="px-3 py-2 text-xs capitalize text-muted-foreground">{(r.source ?? "manual").replace(/_/g, " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Insurance payment table */}
      <Card className="mb-4 relative overflow-hidden">
        {insCleared && <Watermark text="PAID IN FULL" color="blue" />}
        <div className="p-4 border-b border-border font-serif text-lg">Insurance Payment Table</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2 text-right">Insurance Paid</th>
                <th className="px-3 py-2 text-right">Insurance Balance</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {insRows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No insurance payments yet</td></tr>}
              {insRows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{fmtDate(r.date)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(r.amount)}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{fmtKES(r.balance)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Schedule */}
      <Card className="mb-4">
        <div className="p-4 border-b border-border font-serif text-lg">Repayment Schedule</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Due Date</th>
                <th className="px-3 py-2 text-right">Expected</th>
                <th className="px-3 py-2 text-right">Paid</th>
                <th className="px-3 py-2 text-right">Fine</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {schedule.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No schedule</td></tr>}
              {schedule.map((s: any) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono">{s.period_number}</td>
                  <td className="px-3 py-2">{fmtDate(s.due_date)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(s.expected_amount)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(s.amount_paid)}</td>
                  <td className="px-3 py-2 text-right font-mono text-red-600">{fmtKES(s.fine_amount ?? 0)}</td>
                  <td className="px-3 py-2 text-xs">{loanCleared ? "paid" : s.status === "prepaid" ? "paid in advance" : s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Penalty History */}
      <Card>
        <div className="p-4 border-b border-border font-serif text-lg">Penalty History</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="px-3 py-2">Date</th><th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {fines.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No penalties</td></tr>}
            {fines.map((f: any) => (
              <tr key={f.id} className="border-b last:border-0">
                <td className="px-3 py-2">{fmtDate(f.fine_date)}</td>
                <td className="px-3 py-2">{f.reason}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtKES(f.amount)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtKES(f.amount_paid)}</td>
                <td className="px-3 py-2 text-xs">{f.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {insOpen && (
        <InsurancePaymentDialog
          loanId={loanId}
          insBalance={insBalance}
          onClose={() => setInsOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["loan", loanId] });
            qc.invalidateQueries({ queryKey: ["loan-insurance", loanId] });
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`mt-1 font-mono ${highlight ? "font-bold text-navy text-base" : ""}`}>{value}</div>
    </div>
  );
}

function Watermark({ text, color = "emerald" }: { text: string; color?: "emerald" | "blue" }) {
  const c = color === "blue" ? "text-blue-600/15 border-blue-600/20" : "text-emerald-600/15 border-emerald-600/20";
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden">
      <div className={`select-none -rotate-12 text-[4rem] md:text-[7rem] font-black tracking-widest ${c} border-8 rounded-2xl px-10 py-3`}>
        {text}
      </div>
    </div>
  );
}

function InsurancePaymentDialog({ loanId, insBalance, onClose, onSaved }: { loanId: string; insBalance: number; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ amount: "", payment_date: new Date().toISOString().slice(0, 10), notes: "" });
  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("record_insurance_payment", {
        _loan_id: loanId,
        _amount: Number(form.amount),
        _payment_date: form.payment_date,
        _notes: form.notes || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success("Insurance payment recorded"); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">Insurance Payment</DialogTitle></DialogHeader>
        <div className="text-xs text-muted-foreground mb-2">Current insurance balance: <span className="font-mono">{fmtKES(insBalance)}</span></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Amount</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div><Label>Date</Label><Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} /></div>
          <div className="col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending || !form.amount} className="bg-navy text-white hover:bg-navy-2">{submit.isPending ? "Saving…" : "Record"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

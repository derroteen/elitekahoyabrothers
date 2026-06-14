import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtKES, fmtDate } from "@/lib/format";
import { deleteLoanPayment, editLoanPayment } from "@/lib/loan.functions";
import { deleteLoanFine, editLoanFine, deleteInsurancePayment, editInsurancePayment } from "@/lib/entries.functions";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/loans/$loanId")({
  component: LoanLedger,
  head: () => ({ meta: [{ title: "Loan Ledger — EKB" }] }),
});

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  prepaid: "bg-emerald-100 text-emerald-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  active: "bg-blue-100 text-blue-700",
  completed: "bg-gray-100 text-gray-700",
  completed_with_fine: "bg-orange-100 text-orange-700",
  rejected: "bg-red-50 text-red-700",
  unpaid: "bg-red-100 text-red-700",
  partial: "bg-amber-100 text-amber-700",
};

function LoanLedger() {
  const { loanId } = Route.useParams();
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const doDeletePayment = useServerFn(deleteLoanPayment);
  const [editPayment, setEditPayment] = useState<any>(null);

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

  const { data: fines = [] } = useQuery({
    queryKey: ["loan-fines", loanId],
    enabled: !!user,
    queryFn: async () => (await (supabase.from("loan_fines" as any) as any).select("*").eq("loan_id", loanId).order("fine_date")).data ?? [],
  });

  const { data: repayments = [] } = useQuery({
    queryKey: ["loan-repayments", loanId],
    enabled: !!user,
    queryFn: async () => (await supabase.from("loan_repayments").select("*").eq("loan_id", loanId).order("payment_date")).data ?? [],
  });

  if (!loan) return <div className="p-8 text-muted-foreground">Loading…</div>;

  const nextDue = schedule.find((s: any) => s.status !== "paid" && s.status !== "prepaid");
  const isStaff = role === "super_admin" || role === "admin" || role === "auditor";
  const canEditPayments = role === "super_admin" || role === "admin";
  const backTo = isStaff ? "/loans" : "/my-loans";
  const refreshLoan = () => {
    qc.invalidateQueries({ queryKey: ["loan", loanId] });
    qc.invalidateQueries({ queryKey: ["loan-schedule", loanId] });
    qc.invalidateQueries({ queryKey: ["loan-fines", loanId] });
    qc.invalidateQueries({ queryKey: ["loan-repayments", loanId] });
  };
  const onDeletePayment = async (payment: any) => {
    if (!confirm("Are you sure you want to delete this payment?")) return;
    try {
      await doDeletePayment({ data: { id: payment.id, loan_id: loanId } });
      toast.success("Payment deleted and balances recalculated");
      refreshLoan();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete payment");
    }
  };

  return (
    <div>
      <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy mb-3">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>
      <PageHeader title={`Loan Ledger — ${loan.profile?.full_name ?? ""}`} subtitle={loan.profile?.membership_no ?? ""} />

      <Card className="mb-4">
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Stat label="Loan Amount" value={fmtKES(loan.amount_borrowed)} />
          <Stat label="Interest Rate" value={`${Number(loan.interest_rate).toFixed(1)}%`} />
          <Stat label="Payment Frequency" value={loan.payment_frequency} />
          <Stat label="Term" value={`${loan.loan_term_months} months`} />
          <Stat label="Loan Date" value={fmtDate(loan.loan_date)} />
          <Stat label="Total Repayable" value={fmtKES(loan.total_repayable)} />
          <Stat label="Total Paid" value={fmtKES(loan.amount_paid)} />
          <Stat label="Outstanding Balance" value={fmtKES(loan.balance)} highlight />
          <Stat label="Total Interest Added" value={fmtKES(loan.total_interest_added ?? 0)} />
          <Stat label="Total Fines Charged" value={fmtKES(loan.total_fines_charged ?? 0)} />
          <Stat label="Total Fines Paid" value={fmtKES(loan.total_fines_paid ?? 0)} />
          <Stat label="Outstanding Fines" value={fmtKES(loan.outstanding_fines ?? 0)} highlight={Number(loan.outstanding_fines) > 0} />
          <Stat label="Next Payment Due" value={nextDue ? fmtDate(nextDue.due_date) : "—"} />
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Status</div>
            <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[loan.status] ?? "bg-gray-100 text-gray-700"}`}>{loan.status.replace(/_/g, " ")}</span>
          </div>
        </div>
      </Card>

      <Card className="mb-4">
        <div className="p-4 border-b border-border font-serif text-lg">Running Loan Ledger</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Due Date</th>
                <th className="px-3 py-2 text-right">Expected</th>
                <th className="px-3 py-2 text-right">Paid</th>
                <th className="px-3 py-2 text-right">Fine Charged</th>
                <th className="px-3 py-2 text-right">Fine Paid</th>
                <th className="px-3 py-2 text-right">Outstanding Fine</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {schedule.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No schedule</td></tr>}
              {schedule.map((s: any) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono">{s.period_number}</td>
                  <td className="px-3 py-2">{fmtDate(s.due_date)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(s.expected_amount)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(s.amount_paid)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(s.fine_amount ?? 0)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(s.fine_paid ?? 0)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(Number(s.fine_amount ?? 0) - Number(s.fine_paid ?? 0))}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(s.balance_remaining)}</td>
                  <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[s.status] ?? "bg-gray-100"}`}>{s.status}</span></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{s.prepaid ? "Prepaid" : s.remarks ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mb-4">
        <div className="p-4 border-b border-border font-serif text-lg">Fine History</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="px-3 py-2">Date</th><th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {fines.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No fines</td></tr>}
            {fines.map((f: any) => (
              <tr key={f.id} className="border-b last:border-0">
                <td className="px-3 py-2">{fmtDate(f.fine_date)}</td>
                <td className="px-3 py-2">{f.reason}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtKES(f.amount)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtKES(f.amount_paid)}</td>
                <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[f.status] ?? "bg-gray-100"}`}>{f.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <div className="p-4 border-b border-border font-serif text-lg">Payment History</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Fine Paid</th>
                <th className="px-3 py-2 text-right">Principal Paid</th>
                <th className="px-3 py-2">Notes</th>
                {canEditPayments && <th className="px-3 py-2 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {repayments.length === 0 && <tr><td colSpan={canEditPayments ? 8 : 7} className="p-4 text-center text-muted-foreground">No payments yet</td></tr>}
              {repayments.map((r: any) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{fmtDate(r.payment_date)}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.source === "weekly" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>
                      {r.source === "weekly" ? "Weekly Sheet" : "Manual"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs capitalize">{(r.payment_method ?? "").replace(/_/g, " ") || "—"}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{fmtKES(r.amount)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(r.fine_paid ?? 0)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(r.principal_paid ?? 0)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.notes ?? ""}</td>
                  {canEditPayments && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setEditPayment(r)}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => onDeletePayment(r)}>Delete</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <EditPaymentDialog payment={editPayment} loanId={loanId} onClose={() => setEditPayment(null)} onSaved={refreshLoan} />
    </div>
  );
}

function EditPaymentDialog({ payment, loanId, onClose, onSaved }: any) {
  const doEditPayment = useServerFn(editLoanPayment);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ payment_date: "", amount: "", reference: "", notes: "" });

  useEffect(() => {
    if (!payment) return;
    const notes = payment.notes ?? "";
    const match = notes.match(/^Reference: ([^|]+)(?: \| (.*))?$/);
    setForm({
      payment_date: payment.payment_date ?? "",
      amount: String(payment.amount ?? ""),
      reference: match?.[1]?.trim() ?? "",
      notes: match ? (match[2] ?? "") : notes,
    });
  }, [payment?.id]);

  const submit = async () => {
    if (!payment) return;
    if (!form.amount) { toast.error("Amount required"); return; }
    setSubmitting(true);
    try {
      await doEditPayment({ data: { id: payment.id, loan_id: loanId, amount: Number(form.amount), payment_date: form.payment_date, payment_method: payment.payment_method ?? null, reference: form.reference || null, notes: form.notes || null } });
      toast.success("Payment updated and balances recalculated");
      onClose();
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to edit payment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!payment} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">Edit Loan Payment</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Payment Date</Label><Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} /></div>
          <div><Label>Amount</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="col-span-2"><Label>Reference</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
          <div className="col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-navy text-white hover:bg-navy-2">{submitting ? "Saving…" : "Save Payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

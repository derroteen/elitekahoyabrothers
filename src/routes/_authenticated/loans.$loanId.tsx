import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtKES } from "@/lib/format";
import { addLoanPayment, deleteLoanPayment, editLoanPayment, updateLoanPassbookOpeningBalance } from "@/lib/loan.functions";
import { deleteLoanFine, editLoanFine, deleteInsurancePayment, editInsurancePayment, addLoanFine, addInsurancePayment, recordFinePayment, removeAppliedFines } from "@/lib/entries.functions";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { isOpeningLoanId, normalizeLoanId } from "@/lib/loan-balance";

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
  cleared: "bg-emerald-100 text-emerald-700",
};

const FINE_PENALTY = 200;

/** DD/MM/YYYY for ledger tables and forms */
function fmtLedgerDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const raw = typeof d === "string" ? d.split("T")[0] : d.toISOString().slice(0, 10);
  const [y, m, day] = raw.split("-");
  if (!y || !m || !day) return "—";
  return `${day}/${m}/${y}`;
}

function repayDate(r: { repayment_date?: string; payment_date?: string } | null | undefined) {
  return r?.repayment_date ?? r?.payment_date ?? "";
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function finePeriodLabel(fine: any, schedule: any[]) {
  if (fine.schedule_id) {
    const row = schedule.find((s: any) => s.id === fine.schedule_id);
    if (row?.period_number) return `Week ${row.period_number}`;
  }
  const match = fine.reason?.match(/Week\s+(\d+)/i);
  if (match) return `Week ${match[1]}`;
  return fine.reason?.replace(/\s*\[Paid.*$/, "") ?? "—";
}

function fineRepaymentDate(f: any) {
  const dmy = f.reason?.match(/\[Paid (\d{2}\/\d{2}\/\d{4})/);
  if (dmy) return dmy[1];
  const iso = f.reason?.match(/\[Paid (\d{4}-\d{2}-\d{2})/);
  if (iso) return fmtLedgerDate(iso[1]);
  return fmtLedgerDate(f.updated_at ?? f.fine_date);
}

function LoanLedger() {
  const { loanId } = Route.useParams();
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const doDeletePayment = useServerFn(deleteLoanPayment);
  const doDeleteFine = useServerFn(deleteLoanFine);
  const doDeleteIns = useServerFn(deleteInsurancePayment);
  const doRemoveAllFines = useServerFn(removeAppliedFines);
  const doUpdatePassbookStart = useServerFn(updateLoanPassbookOpeningBalance);
  const [editPayment, setEditPayment] = useState<any>(null);
  const [editFine, setEditFineState] = useState<any>(null);
  const [editIns, setEditInsState] = useState<any>(null);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [addPaymentPrefill, setAddPaymentPrefill] = useState<{ amount?: string; notes?: string } | null>(null);
  const [addInsOpen, setAddInsOpen] = useState(false);
  const [addFineOpen, setAddFineOpen] = useState(false);
  const [recordFineOpen, setRecordFineOpen] = useState(false);
  const finesGeneratedRef = useRef(false);
  const [passbookStartValue, setPassbookStartValue] = useState("");
  const [savingPassbookStart, setSavingPassbookStart] = useState(false);

  const isOpening = isOpeningLoanId(loanId);
  const normalizedId = normalizeLoanId(loanId);

  const { data: loan, isLoading: loanLoading } = useQuery({
    queryKey: ["loan", loanId],
    enabled: !!user,
    queryFn: async () => {
      let l: any;
      if (isOpening) {
        const { data } = await (supabase as any)
          .from("loan_opening_balances")
          .select("*")
          .eq("id", normalizedId)
          .maybeSingle();
        l = data;
      } else {
        const { data } = await supabase.from("loans").select("*").eq("id", loanId).maybeSingle();
        l = data;
      }
      if (!l) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, membership_no, email, phone")
        .eq("id", l.member_id)
        .maybeSingle();
      return { ...l, profile, __opening: isOpening };
    },
  });

  const navigate = useNavigate();
  const isStaff = role === "super_admin" || role === "admin" || role === "auditor";

  useEffect(() => {
    if (!loanLoading && !isStaff && loan && loan.member_id !== user?.id) {
      // Redirect to my loans if not staff and trying to view someone else's loan
      navigate({ to: "/my-loans" });
    }
  }, [loanLoading, isStaff, loan, user, navigate]);

  const { data: schedule = [] } = useQuery({
    queryKey: ["loan-schedule", loanId],
    enabled: !!user && !isOpening,
    queryFn: async () => (await (supabase.from("loan_schedule" as any) as any).select("*").eq("loan_id", loanId).order("period_number")).data ?? [],
  });

  const { data: fines = [] } = useQuery({
    queryKey: ["loan-fines", loanId],
    enabled: !!user && !isOpening,
    queryFn: async () => (await (supabase.from("loan_fines" as any) as any).select("*").eq("loan_id", loanId).order("fine_date")).data ?? [],
  });

  const { data: repayments = [], isLoading: repaymentsLoading } = useQuery({
    queryKey: ["loan-repayments", loanId],
    enabled: !!user,
    queryFn: async () => {
      if (isOpening) {
        const { data } = await (supabase as any)
          .from("loan_repayments")
          .select("*")
          .eq("opening_loan_id", normalizedId)
          .order("payment_date");
        return data ?? [];
      }
      let res = await supabase.from("loan_repayments").select("*").eq("loan_id", loanId).order("repayment_date");
      if (res.error) {
        res = await supabase.from("loan_repayments").select("*").eq("loan_id", loanId).order("payment_date");
      }
      return res.data ?? [];
    },
  });

  const { data: insurancePayments = [] } = useQuery({
    queryKey: ["loan-insurance", loanId],
    enabled: !!user && !isOpening,
    queryFn: async () => (await (supabase.from("loan_insurance_payments" as any) as any).select("*").eq("loan_id", loanId).order("payment_date")).data ?? [],
  });

  const canEditPayments = role === "super_admin" || role === "admin";
  const canDelete = role === "super_admin";
  const backTo = isStaff ? "/loans" : "/my-loans";

  const refreshLoan = () => {
    qc.invalidateQueries({ queryKey: ["loan", loanId] });
    qc.invalidateQueries({ queryKey: ["loan-schedule", loanId] });
    qc.invalidateQueries({ queryKey: ["loan-fines", loanId] });
    qc.invalidateQueries({ queryKey: ["loan-repayments", loanId] });
    qc.invalidateQueries({ queryKey: ["loan-insurance", loanId] });
    qc.invalidateQueries({ queryKey: ["opening-loans"] });
    qc.invalidateQueries({ queryKey: ["loans-all"] });
  };

  useEffect(() => {
    setPassbookStartValue(loan?.passbook_opening_balance == null ? "" : String(loan.passbook_opening_balance));
  }, [loanId, loan?.passbook_opening_balance]);

  const ledgerRows = useMemo(() => {
    if (!isOpening && schedule.length > 0) return schedule;
    const sorted = [...repayments].sort((a, b) => repayDate(a).localeCompare(repayDate(b)));
    let balance = isOpening ? Number(loan?.total_repayable ?? 0) : Number(loan?.total_repayable ?? 0);
    return sorted.map((r: any, i: number) => {
      const paid = Number(r.amount ?? 0);
      balance = Math.max(0, balance - paid);
      return {
        id: r.id,
        period_number: i + 1,
        due_date: repayDate(r),
        expected_amount: paid,
        amount_paid: paid,
        fine_amount: 0,
        fine_paid: 0,
        balance_remaining: balance,
        status: "paid",
        prepaid: false,
        remarks: r.notes ?? "",
      };
    });
  }, [isOpening, schedule, repayments, loan?.total_repayable]);

  const ledgerTotals = useMemo(() => {
    const expected = ledgerRows.reduce((s: number, r: any) => s + Number(r.expected_amount ?? 0), 0);
    const paid = ledgerRows.reduce((s: number, r: any) => s + Number(r.amount_paid ?? 0), 0);
    const fineCharged = ledgerRows.reduce((s: number, r: any) => s + Number(r.fine_amount ?? 0), 0);
    const finePaid = ledgerRows.reduce((s: number, r: any) => s + Number(r.fine_paid ?? 0), 0);
    return {
      expected,
      paid,
      fineCharged,
      finePaid,
      outstandingFine: fineCharged - finePaid,
      currentBalance: isOpening ? Number(loan?.balance ?? 0) : Number(loan?.balance ?? 0),
    };
  }, [ledgerRows, loan?.balance, isOpening]);

  const paymentTotals = useMemo(() => ({
    amount: repayments.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0),
    finePaid: repayments.reduce((s: number, r: any) => s + Number(r.fine_paid ?? 0), 0),
    principalPaid: repayments.reduce((s: number, r: any) => s + Number(r.principal_paid ?? 0), 0),
  }), [repayments]);

  const fineHistoryTotals = useMemo(() => ({
    amount: fines.reduce((s: number, f: any) => s + Number(f.amount ?? 0), 0),
    paid: fines.reduce((s: number, f: any) => s + Number(f.amount_paid ?? 0), 0),
  }), [fines]);

  const fineRepayments = useMemo(
    () => fines.filter((f: any) => Number(f.amount_paid ?? 0) > 0),
    [fines],
  );

  const fineRepaymentTotals = useMemo(() => ({
    paid: fineRepayments.reduce((s: number, f: any) => s + Number(f.amount_paid ?? 0), 0),
  }), [fineRepayments]);

  const insuranceTotals = useMemo(() => ({
    amount: insurancePayments.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0),
  }), [insurancePayments]);

  const unpaidFines = useMemo(
    () => fines.filter((f: any) => f.status !== "paid" && f.status !== "waived" && Number(f.amount_paid ?? 0) < Number(f.amount ?? 0)),
    [fines],
  );

  // Live reconciliation from loan_repayments (source of truth)
  const liveTotals = useMemo(() => {
    if (isOpening) {
      const principal = Number(loan?.principal ?? 0);
      const totalRepayable = Number(loan?.total_repayable ?? 0);
      const paid = paymentTotals.amount;
      const outstanding = Math.max(0, totalRepayable - paid);
      const cleared = outstanding <= 0;
      return { principal, interest: totalRepayable - principal, subtotal: totalRepayable, paid, outstanding, outstandingFines: 0, cleared };
    }
    const principal = Number(loan?.amount_borrowed ?? 0);
    const interest = Number(loan?.total_interest_added ?? 0);
    const subtotal = principal + interest; // excludes insurance
    const paid = paymentTotals.amount; // SUM(loan_repayments.amount)
    const outstanding = Math.max(0, subtotal - paid);
    const outstandingFines = Math.max(0, fineHistoryTotals.amount - fineHistoryTotals.paid);
    const cleared = subtotal > 0 && outstanding === 0 && outstandingFines === 0;
    return { principal, interest, subtotal, paid, outstanding, outstandingFines, cleared };
  }, [loan, paymentTotals.amount, fineHistoryTotals.amount, fineHistoryTotals.paid, isOpening]);

  useEffect(() => {
    if (isOpening || !canEditPayments || !loanId || schedule.length === 0 || finesGeneratedRef.current) return;
    let cancelled = false;

    (async () => {
      const today = todayISO();
      const existingScheduleIds = new Set(fines.filter((f: any) => f.schedule_id).map((f: any) => f.schedule_id));
      let created = 0;

      for (const s of schedule as any[]) {
        if (cancelled) return;
        if (s.due_date >= today) continue;
        if (Number(s.amount_paid ?? 0) > 0) continue;
        if (s.prepaid) continue;
        if (s.status === "paid" || s.status === "prepaid") continue;
        if (existingScheduleIds.has(s.id)) continue;

        const { error: fineErr } = await (supabase.from("loan_fines" as any) as any).insert({
          loan_id: loanId,
          schedule_id: s.id,
          fine_date: s.due_date,
          amount: FINE_PENALTY,
          reason: `Missed payment - Week ${s.period_number}`,
          status: "unpaid",
        });
        if (fineErr) continue;

        await (supabase.from("loan_schedule" as any) as any).update({
          fine_amount: Number(s.fine_amount ?? 0) + FINE_PENALTY,
          status: "overdue",
        }).eq("id", s.id);

        const { data: currentLoan } = await supabase.from("loans").select("total_fines_charged, outstanding_fines").eq("id", loanId).single();
        if (currentLoan) {
          await supabase.from("loans").update({
            total_fines_charged: Number((currentLoan as any).total_fines_charged ?? 0) + FINE_PENALTY,
            outstanding_fines: Number((currentLoan as any).outstanding_fines ?? 0) + FINE_PENALTY,
          } as any).eq("id", loanId);
        }
        created += 1;
        existingScheduleIds.add(s.id);
      }

      finesGeneratedRef.current = true;
      if (created > 0 && !cancelled) refreshLoan();
    })();

    return () => { cancelled = true; };
  }, [canEditPayments, loanId, schedule, fines, isOpening]);

  if (loanLoading || repaymentsLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!loan) return <div className="p-8 text-muted-foreground">Loan not found</div>;

  const nextDue = !isOpening ? schedule.find((s: any) => s.status !== "paid" && s.status !== "prepaid") : null;

  const onDeletePayment = async (payment: any) => {
    if (!confirm("Are you sure you want to delete this payment? This action cannot be undone.")) return;
    try {
      await doDeletePayment({ data: { id: payment.id, loan_id: loanId } });
      toast.success("Payment deleted and balances recalculated");
      refreshLoan();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete payment");
    }
  };
  const onDeleteFine = async (f: any) => {
    if (!confirm("Delete this fine? This action cannot be undone.")) return;
    try { await doDeleteFine({ data: { id: f.id } }); toast.success("Fine deleted"); refreshLoan(); }
    catch (err: any) { toast.error(err?.message ?? "Failed"); }
  };
  const onDeleteIns = async (p: any) => {
    if (!confirm("Delete this insurance payment? This action cannot be undone.")) return;
    try { await doDeleteIns({ data: { id: p.id } }); toast.success("Insurance payment deleted"); refreshLoan(); }
    catch (err: any) { toast.error(err?.message ?? "Failed"); }
  };

  const onSavePassbookStart = async () => {
    const trimmed = passbookStartValue.trim();
    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (Number.isNaN(parsed) || parsed < 0) {
        toast.error("Enter a valid starting balance or leave it blank");
        return;
      }
    }
    setSavingPassbookStart(true);
    try {
      await doUpdatePassbookStart({
        data: {
          loan_id: loanId,
          passbook_opening_balance: trimmed === "" ? null : Number(trimmed),
        },
      });
      toast.success("Passbook starting balance updated");
      refreshLoan();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update passbook starting balance");
    } finally {
      setSavingPassbookStart(false);
    }
  };

  return (
    <div>
      <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy mb-3">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>
      <PageHeader title={`${isOpening ? "Opening Loan Ledger" : "Loan Ledger"} — ${loan.profile?.full_name ?? ""}`} subtitle={loan.profile?.membership_no ?? ""} />

      <Card className="mb-4 relative">
        {liveTotals.cleared && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="rotate-[-18deg] border-4 border-emerald-600/40 text-emerald-700/40 font-serif text-6xl md:text-8xl tracking-widest px-8 py-3 rounded-md select-none">
              CLEARED
            </div>
          </div>
        )}
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Stat label="Principal" value={fmtKES(liveTotals.principal)} />
          {!isOpening && <Stat label="Interest" value={fmtKES(liveTotals.interest)} />}
          <Stat label={isOpening ? "Total Repayable" : "Subtotal Repayment"} value={fmtKES(liveTotals.subtotal)} />
          <Stat label="Amount Paid" value={fmtKES(liveTotals.paid)} />
          <Stat label="Outstanding Balance" value={fmtKES(liveTotals.outstanding)} highlight />
          {!isOpening && <Stat label="Interest Rate" value={`${Number(loan.interest_rate).toFixed(1)}%`} />}
          {!isOpening && <Stat label="Payment Frequency" value={loan.payment_frequency} />}
          {!isOpening && <Stat label="Term" value={`${loan.loan_term_months} months`} />}
          <Stat label={isOpening ? "Opening Date" : "Loan Date"} value={fmtLedgerDate(loan.loan_date)} />
          {!isOpening && <Stat label="Total Fines Charged" value={fmtKES(fineHistoryTotals.amount)} />}
          {!isOpening && <Stat label="Total Fines Paid" value={fmtKES(fineHistoryTotals.paid)} />}
          {!isOpening && <Stat label="Outstanding Fines" value={fmtKES(liveTotals.outstandingFines)} highlight={liveTotals.outstandingFines > 0} />}
          {!isOpening && <Stat label="Insurance Paid" value={fmtKES(insuranceTotals.amount)} />}
          {!isOpening && <Stat label="Next Payment Due" value={nextDue ? fmtLedgerDate(nextDue.due_date) : "—"} />}
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Status</div>
            <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[loan.status] ?? "bg-gray-100 text-gray-700"}`}>{(loan.status ?? (isOpening ? "active" : "")).replace(/_/g, " ")}</span>
            {liveTotals.cleared && <div className="mt-1 text-xs text-emerald-700 font-semibold">{isOpening ? "LOAN FULLY CLEARED" : "LOAN CLEARED"}</div>}
          </div>
        </div>
      </Card>

      {canEditPayments && (
        <Card className="mb-4">
          <div className="p-4">
            <div className="max-w-md space-y-2">
              <Label>Passbook Starting Balance</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={passbookStartValue}
                onChange={(e) => setPassbookStartValue(e.target.value)}
                placeholder={String(Number(loan?.total_repayable ?? 0))}
              />
              <p className="text-xs text-muted-foreground">
                Used as the starting balance in the member&apos;s passbook. Leave blank to use the full loan amount.
              </p>
              <Button onClick={onSavePassbookStart} disabled={savingPassbookStart} className="bg-navy text-white hover:bg-navy-2">
                {savingPassbookStart ? "Saving..." : "Save Starting Balance"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="mb-4 relative">
        {liveTotals.cleared && !isOpening && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="rotate-[-18deg] border-4 border-emerald-600/40 text-emerald-700/40 font-serif text-6xl md:text-8xl tracking-widest px-8 py-3 rounded-md select-none">
              CLEARED
            </div>
          </div>
        )}
        <div className="p-4 border-b border-border font-serif text-lg">Running Ledger</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Date</th>
                {!isOpening && <th className="px-3 py-2 text-right">Expected</th>}
                <th className="px-3 py-2 text-right">Paid</th>
                {!isOpening && <th className="px-3 py-2 text-right">Fine Charged</th>}
                {!isOpening && <th className="px-3 py-2 text-right">Fine Paid</th>}
                {!isOpening && <th className="px-3 py-2 text-right">Outstanding Fine</th>}
                <th className="px-3 py-2 text-right">Balance</th>
                {!isOpening && <th className="px-3 py-2">Status</th>}
                <th className="px-3 py-2">Remarks</th>
                {canEditPayments && !isOpening && <th className="px-3 py-2 text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {ledgerRows.length === 0 && <tr><td colSpan={canEditPayments && !isOpening ? 11 : (isOpening ? 6 : 10)} className="p-6 text-center text-muted-foreground">No payments yet</td></tr>}
              {ledgerRows.map((s: any) => {
                const outstandingRow = !isOpening ? Math.max(0, Number(s.expected_amount ?? 0) - Number(s.amount_paid ?? 0)) : 0;
                const rowDone = !isOpening && (s.status === "paid" || s.status === "prepaid" || outstandingRow <= 0);
                return (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono">{s.period_number}</td>
                  <td className="px-3 py-2">{fmtLedgerDate(s.due_date)}</td>
                  {!isOpening && <td className="px-3 py-2 text-right font-mono">{fmtKES(s.expected_amount)}</td>}
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(s.amount_paid)}</td>
                  {!isOpening && <td className="px-3 py-2 text-right font-mono">{fmtKES(s.fine_amount ?? 0)}</td>}
                  {!isOpening && <td className="px-3 py-2 text-right font-mono">{fmtKES(s.fine_paid ?? 0)}</td>}
                  {!isOpening && <td className="px-3 py-2 text-right font-mono">{fmtKES(Number(s.fine_amount ?? 0) - Number(s.fine_paid ?? 0))}</td>}
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(s.balance_remaining)}</td>
                  {!isOpening && <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[s.status] ?? "bg-gray-100"}`}>{s.status}</span></td>}
                  <td className="px-3 py-2 text-xs text-muted-foreground">{s.prepaid ? "Prepaid" : s.remarks ?? ""}</td>
                  {canEditPayments && !isOpening && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {!rowDone && !liveTotals.cleared && (
                        <Button
                          size="sm"
                          className="h-7 px-2 bg-navy text-white hover:bg-navy-2"
                          onClick={() => {
                            setAddPaymentPrefill({
                              amount: String(outstandingRow),
                              notes: `Week ${s.period_number} payment`,
                            });
                            setAddPaymentOpen(true);
                          }}
                        >
                          Pay
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
                );
              })}
              {ledgerRows.length > 0 && !isOpening && (
                <tr className="bg-muted/40 font-semibold border-t-2 border-border">
                  <td className="px-3 py-2" colSpan={2}>TOTALS</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(ledgerTotals.expected)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(ledgerTotals.paid)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(ledgerTotals.fineCharged)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(ledgerTotals.finePaid)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(ledgerTotals.outstandingFine)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(liveTotals.outstanding)}</td>
                  <td className="px-3 py-2" colSpan={canEditPayments ? 3 : 2} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {!isOpening && (
        <Card className="mb-4">
          <div className="p-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
            <span className="font-serif text-lg">Fine History</span>
            <div className="flex items-center gap-2">
              {canEditPayments && (
                <Button size="sm" className="bg-navy text-white hover:bg-navy-2" onClick={() => setAddFineOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Add Fine
                </Button>
              )}
              {canDelete && fines.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={async () => {
                    if (!confirm(`Remove ALL ${fines.length} applied fine(s) for this loan? This will also delete their passbook fine payments and recalc loan totals. This action cannot be undone.`)) return;
                    try {
                      const res = await doRemoveAllFines({ data: { loan_id: loanId } });
                      toast.success(`Removed ${(res as any)?.removed ?? 0} fine(s)`);
                      refreshLoan();
                    } catch (err: any) { toast.error(err?.message ?? "Failed to remove fines"); }
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Remove Applied Fines
                </Button>
              )}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-3 py-2">Date</th><th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2">Status</th>
                {canEditPayments && <th className="px-3 py-2 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {fines.length === 0 && <tr><td colSpan={canEditPayments ? 6 : 5} className="p-4 text-center text-muted-foreground">No fines</td></tr>}
              {fines.map((f: any) => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{fmtLedgerDate(f.fine_date)}</td>
                  <td className="px-3 py-2">{f.reason}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(f.amount)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(f.amount_paid)}</td>
                  <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[f.status] ?? "bg-gray-100"}`}>{f.status}</span></td>
                  {canEditPayments && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => setEditFineState(f)} className="text-blue-600 hover:text-blue-800 mr-2" title="Edit"><Pencil className="w-4 h-4 inline" /></button>
                      {canDelete && <button onClick={() => onDeleteFine(f)} className="text-red-600 hover:text-red-800" title="Delete"><Trash2 className="w-4 h-4 inline" /></button>}
                    </td>
                  )}
                </tr>
              ))}
              {fines.length > 0 && (
                <tr className="bg-muted/40 font-semibold border-t-2 border-border">
                  <td className="px-3 py-2" colSpan={2}>TOTALS</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(fineHistoryTotals.amount)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(fineHistoryTotals.paid)}</td>
                  <td className="px-3 py-2" colSpan={canEditPayments ? 2 : 1} />
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {!isOpening && (
        <Card className="mb-4">
          <div className="p-4 border-b border-border flex items-center justify-between gap-2">
            <span className="font-serif text-lg">Fine Repayments</span>
            {canEditPayments && (
              <Button size="sm" className="bg-navy text-white hover:bg-navy-2" onClick={() => setRecordFineOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Record Fine Payment
              </Button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Fine Period</th>
                <th className="px-3 py-2 text-right">Amount Paid</th>
                <th className="px-3 py-2">Notes</th>
                {canEditPayments && <th className="px-3 py-2 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {fineRepayments.length === 0 && <tr><td colSpan={canEditPayments ? 5 : 4} className="p-4 text-center text-muted-foreground">No fine repayments recorded</td></tr>}
              {fineRepayments.map((f: any) => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{fineRepaymentDate(f)}</td>
                  <td className="px-3 py-2">{finePeriodLabel(f, schedule)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(f.amount_paid)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{f.reason?.replace(/\s*\[Paid.*$/, "") ?? ""}</td>
                  {canEditPayments && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => setEditFineState(f)} className="text-blue-600 hover:text-blue-800 mr-2" title="Edit"><Pencil className="w-4 h-4 inline" /></button>
                      {canDelete && <button onClick={() => onDeleteFine(f)} className="text-red-600 hover:text-red-800" title="Delete"><Trash2 className="w-4 h-4 inline" /></button>}
                    </td>
                  )}
                </tr>
              ))}
              {fineRepayments.length > 0 && (
                <tr className="bg-muted/40 font-semibold border-t-2 border-border">
                  <td className="px-3 py-2" colSpan={2}>TOTALS</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(fineRepaymentTotals.paid)}</td>
                  <td className="px-3 py-2" colSpan={canEditPayments ? 2 : 1} />
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {!isOpening && (
        <Card className="mb-4">
          <div className="p-4 border-b border-border flex items-center justify-between gap-2">
            <span className="font-serif text-lg">Insurance Payments</span>
            {canEditPayments && (
              <Button size="sm" className="bg-navy text-white hover:bg-navy-2" onClick={() => setAddInsOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add Insurance Payment
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Amount Paid</th>
                  <th className="px-3 py-2">Notes</th>
                  {canEditPayments && <th className="px-3 py-2 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {insurancePayments.length === 0 && <tr><td colSpan={canEditPayments ? 4 : 3} className="p-4 text-center text-muted-foreground">No insurance payments</td></tr>}
                {insurancePayments.map((p: any) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{fmtLedgerDate(p.payment_date)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtKES(p.amount)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{p.notes ?? ""}</td>
                    {canEditPayments && (
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => setEditInsState(p)} className="text-blue-600 hover:text-blue-800 mr-2" title="Edit"><Pencil className="w-4 h-4 inline" /></button>
                        {canDelete && <button onClick={() => onDeleteIns(p)} className="text-red-600 hover:text-red-800" title="Delete"><Trash2 className="w-4 h-4 inline" /></button>}
                      </td>
                    )}
                  </tr>
                ))}
                {insurancePayments.length > 0 && (
                  <tr className="bg-muted/40 font-semibold border-t-2 border-border">
                    <td className="px-3 py-2">TOTALS</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtKES(insuranceTotals.amount)}</td>
                    <td className="px-3 py-2" colSpan={canEditPayments ? 2 : 1} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <div className="p-4 border-b border-border flex items-center justify-between gap-2">
          <span className="font-serif text-lg">Payment History</span>
          {canEditPayments && !loan.status?.includes("rejected") && !loan.status?.includes("completed") && (
            <Button size="sm" className="bg-navy text-white hover:bg-navy-2" onClick={() => setAddPaymentOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add Payment
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w=[860px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2 text-right">Amount</th>
                {!isOpening && <th className="px-3 py-2 text-right">Fine Paid</th>}
                <th className="px-3 py-2 text-right">Principal Paid</th>
                <th className="px-3 py-2">Notes</th>
                {canEditPayments && <th className="px-3 py-2 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {repayments.length === 0 && <tr><td colSpan={canEditPayments ? 8 : 7} className="p-4 text-center text-muted-foreground">No payments yet</td></tr>}
              {repayments.map((r: any) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{fmtLedgerDate(repayDate(r))}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.source === "weekly" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>
                      {r.source === "weekly" ? "Weekly Sheet" : "Manual"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs capitalize">{(r.payment_method ?? "").replace(/_/g, " ") || "—"}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{fmtKES(r.amount)}</td>
                  {!isOpening && <td className="px-3 py-2 text-right font-mono">{fmtKES(r.fine_paid ?? 0)}</td>}
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(r.principal_paid ?? 0)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.notes ?? ""}</td>
                  {canEditPayments && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setEditPayment(r)}>Edit</Button>
                      {canDelete && <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => onDeletePayment(r)}>Delete</Button>}
                    </td>
                  )}
                </tr>
              ))}
              {repayments.length > 0 && (
                <tr className="bg-muted/40 font-semibold border-t-2 border-border">
                  <td className="px-3 py-2" colSpan={3}>TOTALS</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(paymentTotals.amount)}</td>
                  {!isOpening && <td className="px-3 py-2 text-right font-mono">{fmtKES(paymentTotals.finePaid)}</td>}
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(paymentTotals.principalPaid)}</td>
                  <td className="px-3 py-2" colSpan={canEditPayments ? 2 : 1} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <AddPaymentDialog open={addPaymentOpen} loanId={loanId} loan={loan} prefill={addPaymentPrefill} onClose={() => { setAddPaymentOpen(false); setAddPaymentPrefill(null); }} onSaved={refreshLoan} />
      {!isOpening && <AddInsuranceDialog open={addInsOpen} loanId={loanId} onClose={() => setAddInsOpen(false)} onSaved={refreshLoan} />}
      {!isOpening && <AddFineDialog open={addFineOpen} loanId={loanId} onClose={() => setAddFineOpen(false)} onSaved={refreshLoan} />}
      {!isOpening && <RecordFinePaymentDialog open={recordFineOpen} loanId={loanId} unpaidFines={unpaidFines} schedule={schedule} onClose={() => setRecordFineOpen(false)} onSaved={refreshLoan} />}
      <EditPaymentDialog payment={editPayment} loanId={loanId} onClose={() => setEditPayment(null)} onSaved={refreshLoan} />
      {!isOpening && <EditFineDialog fine={editFine} onClose={() => setEditFineState(null)} onSaved={refreshLoan} />}
      {!isOpening && <EditInsuranceDialog payment={editIns} onClose={() => setEditInsState(null)} onSaved={refreshLoan} />}
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`font-mono text-lg ${highlight ? "text-navy font-bold" : ""}`}>{value}</div>
    </div>
  );
}

function AddPaymentDialog({ open, loanId, loan, prefill, onClose, onSaved }: any) {
  const doAdd = useServerFn(addLoanPayment);
  const [form, setForm] = useState({
    repayment_date: todayISO(),
    amount: "",
    payment_method: "cash",
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        repayment_date: todayISO(),
        amount: prefill?.amount ?? "",
        payment_method: "cash",
        notes: prefill?.notes ?? "",
      });
    }
  }, [open, prefill?.amount, prefill?.notes]);

  const submit = async () => {
    const amt = Number(form.amount);
    if (!form.repayment_date) { toast.error("Repayment date required"); return; }
    if (form.amount === "" || Number.isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setBusy(true);
    try {
      await doAdd({
        data: {
          loan_id: loanId,
          amount: amt,
          payment_date: form.repayment_date,
          payment_method: form.payment_method,
          notes: form.notes || null,
        },
      });
      toast.success("Payment recorded and balances updated");
      onClose();
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to record payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">Add Payment</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {loan?.profile?.full_name ?? ""} · Outstanding {fmtKES(loan?.balance ?? 0)}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Repayment Date</Label>
            <Input type="date" value={form.repayment_date} onChange={(e) => setForm({ ...form, repayment_date: e.target.value })} />
            {form.repayment_date && <p className="text-xs text-muted-foreground mt-1">{fmtLedgerDate(form.repayment_date)}</p>}
          </div>
          <div>
            <Label>Amount (KES)</Label>
            <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Payment Method</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="mpesa">M-Pesa</option>
              <option value="bank_transfer">Bank Transfer</option>
            </select>
          </div>
          <div className="col-span-2">
            <Label>Notes (optional)</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-navy text-white hover:bg-navy-2">{busy ? "Saving…" : "Save Payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddInsuranceDialog({ open, loanId, onClose, onSaved }: any) {
  const doAdd = useServerFn(addInsurancePayment);
  const [form, setForm] = useState({ payment_date: todayISO(), amount: "", notes: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm({ payment_date: todayISO(), amount: "", notes: "" });
  }, [open]);

  const submit = async () => {
    const amt = Number(form.amount);
    if (!form.payment_date) { toast.error("Payment date required"); return; }
    if (form.amount === "" || Number.isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setBusy(true);
    try {
      await doAdd({ data: { loan_id: loanId, amount: amt, payment_date: form.payment_date, notes: form.notes || null } });
      toast.success("Insurance payment recorded");
      onClose();
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to record insurance payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">Add Insurance Payment</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Payment Date</Label>
            <Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
            {form.payment_date && <p className="text-xs text-muted-foreground mt-1">{fmtLedgerDate(form.payment_date)}</p>}
          </div>
          <div>
            <Label>Amount (KES)</Label>
            <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Notes (optional)</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-navy text-white hover:bg-navy-2">{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddFineDialog({ open, loanId, onClose, onSaved }: any) {
  const doAdd = useServerFn(addLoanFine);
  const [form, setForm] = useState({ fine_date: todayISO(), amount: "200", reason: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm({ fine_date: todayISO(), amount: "200", reason: "" });
  }, [open]);

  const submit = async () => {
    const amt = Number(form.amount);
    if (!form.fine_date) { toast.error("Fine date required"); return; }
    if (!form.reason.trim()) { toast.error("Reason required"); return; }
    if (Number.isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setBusy(true);
    try {
      await doAdd({ data: { loan_id: loanId, amount: amt, fine_date: form.fine_date, reason: form.reason.trim() } });
      toast.success("Fine added");
      onClose();
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add fine");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">Add Fine</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Fine Date</Label>
            <Input type="date" value={form.fine_date} onChange={(e) => setForm({ ...form, fine_date: e.target.value })} />
          </div>
          <div>
            <Label>Amount (KES)</Label>
            <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Reason</Label>
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason for the fine" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-navy text-white hover:bg-navy-2">{busy ? "Saving…" : "Add Fine"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordFinePaymentDialog({ open, loanId, unpaidFines, schedule, onClose, onSaved }: any) {
  const doRecord = useServerFn(recordFinePayment);
  const [form, setForm] = useState({ payment_date: todayISO(), fine_id: "", amount: "", notes: "" });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const amt = Number(form.amount);
    if (!form.payment_date) { toast.error("Payment date required"); return; }
    if (!form.fine_id) { toast.error("Select a fine"); return; }
    if (form.amount === "" || Number.isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setBusy(true);
    try {
      await doRecord({
        data: {
          loan_id: loanId,
          fine_id: form.fine_id,
          amount: amt,
          payment_date: form.payment_date,
          notes: form.notes || null,
        },
      });
      toast.success("Fine payment recorded");
      onClose();
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to record fine payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">Record Fine Payment</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Select Fine</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={form.fine_id}
              onChange={(e) => setForm({ ...form, fine_id: e.target.value })}
            >
              <option value="">Select a fine…</option>
              {unpaidFines.map((f: any) => (
                <option key={f.id} value={f.id}>
                  {finePeriodLabel(f, schedule)} - {fmtKES(Number(f.amount) - Number(f.amount_paid))} remaining
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Payment Date</Label>
              <Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
            </div>
            <div>
              <Label>Amount (KES)</Label>
              <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-navy text-white hover:bg-navy-2">{busy ? "Saving…" : "Record Payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPaymentDialog({ payment, loanId, onClose, onSaved }: any) {
  const doEdit = useServerFn(editLoanPayment);
  const [form, setForm] = useState({
    amount: "",
    payment_date: todayISO(),
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (payment) {
      setForm({
        amount: String(payment.amount),
        payment_date: repayDate(payment) || todayISO(),
        notes: payment.notes || "",
      });
    }
  }, [payment]);

  if (!payment) return null;

  const submit = async () => {
    const amt = Number(form.amount);
    if (!form.payment_date) { toast.error("Payment date required"); return; }
    if (form.amount === "" || Number.isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setBusy(true);
    try {
      await doEdit({
        data: {
          id: payment.id,
          loan_id: loanId,
          amount: amt,
          payment_date: form.payment_date,
          notes: form.notes || null,
        },
      });
      toast.success("Payment updated");
      onClose();
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!payment} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">Edit Payment</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Payment Date</Label>
            <Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
          </div>
          <div>
            <Label>Amount (KES)</Label>
            <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Notes (optional)</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-navy text-white hover:bg-navy-2">{busy ? "Saving…" : "Update Payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditFineDialog({ fine, onClose, onSaved }: any) {
  const doEdit = useServerFn(editLoanFine);
  const [form, setForm] = useState({ amount: "", reason: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (fine) {
      setForm({
        amount: String(fine.amount),
        reason: fine.reason || "",
      });
    }
  }, [fine]);

  if (!fine) return null;

  const submit = async () => {
    const amt = Number(form.amount);
    if (!form.reason.trim()) { toast.error("Reason required"); return; }
    if (Number.isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setBusy(true);
    try {
      await doEdit({ data: { id: fine.id, amount: amt, reason: form.reason.trim() } });
      toast.success("Fine updated");
      onClose();
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update fine");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!fine} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">Edit Fine</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Amount (KES)</Label>
            <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Reason</Label>
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-navy text-white hover:bg-navy-2">{busy ? "Saving…" : "Update Fine"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditInsuranceDialog({ payment, onClose, onSaved }: any) {
  const doEdit = useServerFn(editInsurancePayment);
  const [form, setForm] = useState({ amount: "", notes: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (payment) {
      setForm({
        amount: String(payment.amount),
        notes: payment.notes || "",
      });
    }
  }, [payment]);

  if (!payment) return null;

  const submit = async () => {
    const amt = Number(form.amount);
    if (Number.isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setBusy(true);
    try {
      await doEdit({ data: { id: payment.id, amount: amt, notes: form.notes || null } });
      toast.success("Insurance payment updated");
      onClose();
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update insurance payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!payment} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">Edit Insurance Payment</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Amount (KES)</Label>
            <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Notes (optional)</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-navy text-white hover:bg-navy-2">{busy ? "Saving…" : "Update Payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

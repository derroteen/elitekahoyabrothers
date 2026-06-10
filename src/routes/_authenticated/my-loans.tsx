import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { fmtKES, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/my-loans")({
  component: MyLoans,
  head: () => ({ meta: [{ title: "My Loans — EKB" }] }),
});

function addMonths(d: string, n: number) {
  const dt = new Date(d);
  dt.setMonth(dt.getMonth() + n);
  return dt.toISOString().slice(0, 10);
}

function MyLoans() {
  const { user } = useAuth();
  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["my-loans", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("loans").select("*").eq("member_id", user!.id).order("created_at", { ascending: false })).data ?? [],
  });

  return (
    <div>
      <PageHeader title="My Loans" subtitle="Your loan accounts, repayment summary and balance" />
      {isLoading && <Card><div className="p-6 text-muted-foreground text-center">Loading…</div></Card>}
      {!isLoading && loans.length === 0 && <Card><div className="p-6 text-muted-foreground text-center">No loans yet</div></Card>}
      <div className="space-y-4">
        {loans.map((l: any) => <LoanSummaryCard key={l.id} loan={l} />)}
      </div>
    </div>
  );
}

function LoanSummaryCard({ loan }: { loan: any }) {
  const principal = Number(loan.amount_borrowed || 0);
  const months = Number(loan.loan_term_months || 0);
  const rate = Number(loan.interest_rate || 0);
  const interest = principal * (rate / 100) * (months / 12);
  const totalPayable = Number(loan.total_repayable ?? principal + interest);
  const balance = Number(loan.balance ?? 0);
  const insTotal = Number(loan.insurance ?? 0);
  const insBalance = Number(loan.insurance_balance ?? insTotal);
  const insPaid = Number(loan.insurance_paid ?? 0);
  const firstRepayment = loan.payment_start_date ?? addMonths(loan.loan_date, 1);
  const loanCleared = balance < 5;
  const insCleared = insBalance < 5;

  return (
    <Card className="relative overflow-hidden">
      {loanCleared && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="select-none -rotate-12 text-[5rem] md:text-[7rem] font-black tracking-widest text-emerald-600/20 border-8 border-emerald-600/25 rounded-2xl px-10 py-3">
            CLEARED
          </div>
        </div>
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="font-serif text-lg text-navy">Loan · {fmtDate(loan.loan_date)}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{loan.payment_frequency} · {months} months · {rate}% p.a.</div>
          </div>
          <div className="flex items-center gap-2">
            {loanCleared ? (
              <span className="text-xs px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold border border-emerald-300">CLEARED</span>
            ) : (
              <span className="text-xs px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-medium uppercase">{(loan.status ?? "").replace(/_/g, " ")}</span>
            )}
            <Link to="/loans/$loanId" params={{ loanId: loan.id }} className="text-navy hover:underline text-sm">View ledger →</Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Field label="Amount Borrowed" value={fmtKES(principal)} />
          <Field label="Interest" value={fmtKES(interest)} />
          <Field label="Total Payment (P+I)" value={fmtKES(totalPayable)} bold />
          <Field label="Per Period" value={fmtKES(loan.period_payment)} />
          <Field label="Period" value={`${months} months`} />
          <Field label="Loan Date" value={fmtDate(loan.loan_date)} />
          <Field label="Payment Start Date" value={fmtDate(firstRepayment)} />
          <Field label="Outstanding Balance" value={fmtKES(balance)} bold highlight />
          <Field label="Insurance (Total)" value={fmtKES(insTotal)} />
          <Field label="Insurance Paid" value={fmtKES(insPaid)} />
          <Field label="Insurance Balance" value={fmtKES(insBalance)} highlight={insBalance > 0} />
          <Field label="Insurance Status" value={insCleared ? "PAID IN FULL" : "Outstanding"} />
        </div>
      </div>
    </Card>
  );
}

function Field({ label, value, bold, highlight }: { label: string; value: any; bold?: boolean; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono ${bold ? "font-bold" : ""} ${highlight ? "text-navy" : ""}`}>{value}</div>
    </div>
  );
}

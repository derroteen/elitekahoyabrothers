import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { PassbookTable } from "@/components/PassbookTable";
import { fetchOpeningBalance, withBroughtForward } from "@/lib/opening-balances";
import { fmtKES, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/my-passbook")({
  component: MyPassbook,
  head: () => ({ meta: [{ title: "My Passbook — EKB" }] }),
});

function MyPassbook() {
  const { user, profile } = useAuth();
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["my-passbook", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [entriesRes, opening] = await Promise.all([
        supabase.from("passbook_entries").select("*").eq("member_id", user!.id).order("entry_date", { ascending: true }),
        fetchOpeningBalance(user!.id),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      return withBroughtForward(entriesRes.data ?? [], opening);
    },
  });

  const { data: loans = [] } = useQuery({
    queryKey: ["my-passbook-loans", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("loans").select("*").eq("member_id", user!.id).order("loan_date", { ascending: false })).data ?? [],
  });

  return (
    <div>
      <PageHeader title="My Passbook" subtitle="Your savings ledger and loan account" />

      {loans.length > 0 && (
        <Card className="mb-4">
          <div className="p-4 border-b border-border font-serif text-lg">Loan Account</div>
          <div className="divide-y divide-border">
            {loans.map((l: any) => {
              const balance = Number(l.balance ?? 0);
              const insBalance = Number(l.insurance_balance ?? l.insurance ?? 0);
              const cleared = balance < 5;
              const insCleared = insBalance < 5;
              return (
                <div key={l.id} className="relative p-4">
                  {cleared && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                      <div className="select-none -rotate-12 text-[4rem] md:text-[6rem] font-black tracking-widest text-emerald-600/20 border-4 border-emerald-600/25 rounded-xl px-6 py-1">
                        CLEARED
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between flex-wrap gap-2 mb-2">
                    <div className="text-sm font-semibold">Loan · {fmtDate(l.loan_date)} · {l.loan_term_months}mo @ {Number(l.interest_rate).toFixed(0)}%</div>
                    <Link to="/loans/$loanId" params={{ loanId: l.id }} className="text-xs text-navy hover:underline">View ledger →</Link>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                    <Stat label="Amount Borrowed" value={fmtKES(l.amount_borrowed)} />
                    <Stat label="Total Payable (P+I)" value={fmtKES(l.total_repayable)} />
                    <Stat label="Loan Paid" value={fmtKES(l.amount_paid)} />
                    <Stat label="Loan Balance" value={fmtKES(balance)} highlight />
                    <Stat label={`Insurance · ${insCleared ? "PAID IN FULL" : "balance"}`} value={fmtKES(insBalance)} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <PassbookTable entries={entries} loading={isLoading} memberName={profile?.full_name} membershipNo={profile?.membership_no ?? undefined} />
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono ${highlight ? "font-bold text-navy" : ""}`}>{value}</div>
    </div>
  );
}

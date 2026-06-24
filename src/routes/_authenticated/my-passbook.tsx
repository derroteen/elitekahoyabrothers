import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fmtKES } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/PageHeader";
import { PassbookTable } from "@/components/PassbookTable";
import { fetchOpeningBalance, withBroughtForward } from "@/lib/opening-balances";

type MemberLoanOption = {
  id: string;
  type: "loan" | "opening";
  label: string;
  total_repayable: number;
  passbook_opening_balance?: number | null;
  sort_date?: string | null;
};

export const Route = createFileRoute("/_authenticated/my-passbook")({
  component: MyPassbook,
  head: () => ({ meta: [{ title: "My Passbook — EKB" }] }),
});

function MyPassbook() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();

  const { data: memberLoans = [] } = useQuery({
    queryKey: ["my-passbook-loans", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<MemberLoanOption[]> => {
      const [loansRes, openingRes] = await Promise.all([
        supabase
          .from("loans")
          .select("id, loan_date, balance, total_repayable, passbook_opening_balance, status")
          .eq("member_id", user!.id)
          .order("loan_date", { ascending: true }),
        (supabase as any)
          .from("loan_opening_balances")
          .select("id, loan_date, balance, total_repayable, passbook_opening_balance")
          .eq("member_id", user!.id)
          .order("loan_date", { ascending: true }),
      ]);
      if (loansRes.error) throw loansRes.error;
      if (openingRes.error) throw openingRes.error;

      const regularLoans = (loansRes.data ?? [])
        .filter((loan: any) => !["completed", "completed_with_fine", "rejected"].includes(String(loan.status ?? "")))
        .map((loan: any) => ({
          id: loan.id,
          type: "loan" as const,
          label: `Loan from ${loan.loan_date} — ${fmtKES(Number(loan.balance ?? 0))} remaining`,
          total_repayable: Number(loan.total_repayable ?? 0),
          passbook_opening_balance: loan.passbook_opening_balance == null ? null : Number(loan.passbook_opening_balance),
          sort_date: loan.loan_date ?? null,
        }));

      const openingLoans = ((openingRes.data ?? []) as any[])
        .filter((loan) => Number(loan.balance ?? 0) > 0)
        .map((loan) => ({
          id: loan.id,
          type: "opening" as const,
          label: `Opening Loan — ${fmtKES(Number(loan.balance ?? 0))} remaining`,
          total_repayable: Number(loan.total_repayable ?? 0),
          passbook_opening_balance: loan.passbook_opening_balance == null ? null : Number(loan.passbook_opening_balance),
          sort_date: loan.loan_date ?? null,
        }));

      return [...openingLoans, ...regularLoans].sort((a, b) => String(a.sort_date ?? "").localeCompare(String(b.sort_date ?? "")));
    },
  });

  // Fetch passbook entries with loan payments
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["my-passbook", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [entriesRes, opening] = await Promise.all([
        supabase.from("passbook_entries").select("*, passbook_entry_loan_payments(*)").eq("member_id", user!.id).order("entry_date", { ascending: true }),
        fetchOpeningBalance(user!.id),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      return withBroughtForward(entriesRes.data ?? [], opening);
    },
    staleTime: 0, // Consider data stale immediately
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  // Add realtime subscription for passbook_entries
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`my-passbook-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "passbook_entries",
          filter: `member_id=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["my-passbook", user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  return (
    <div>
      <PageHeader title="My Passbook" subtitle="Your savings ledger — starts from your Brought Forward balance" />
      <PassbookTable entries={entries} loading={isLoading} memberName={profile?.full_name} membershipNo={profile?.membership_no ?? undefined} memberLoans={memberLoans} />
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/PageHeader";
import { PassbookTable } from "@/components/PassbookTable";
import { fetchOpeningBalance, withBroughtForward } from "@/lib/opening-balances";

export const Route = createFileRoute("/_authenticated/my-passbook")({
  component: MyPassbook,
  head: () => ({ meta: [{ title: "My Passbook — EKB" }] }),
});

function MyPassbook() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();

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
      <PassbookTable entries={entries} loading={isLoading} memberName={profile?.full_name} membershipNo={profile?.membership_no ?? undefined} />
    </div>
  );
}

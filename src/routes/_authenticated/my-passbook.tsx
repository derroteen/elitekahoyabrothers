import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
  return (
    <div>
      <PageHeader title="My Passbook" subtitle="Your savings ledger — starts from your Brought Forward balance" />
      <PassbookTable entries={entries} loading={isLoading} memberName={profile?.full_name} membershipNo={profile?.membership_no ?? undefined} />
    </div>
  );
}

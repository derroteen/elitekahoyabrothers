import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/PageHeader";
import { PassbookTable } from "@/components/PassbookTable";

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
      const { data, error } = await supabase.from("passbook_entries").select("*").eq("member_id", user!.id).order("entry_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div>
      <PageHeader title="My Passbook" subtitle="Your savings ledger" />
      <PassbookTable entries={entries} loading={isLoading} memberName={profile?.full_name} membershipNo={profile?.membership_no ?? undefined} />
    </div>
  );
}

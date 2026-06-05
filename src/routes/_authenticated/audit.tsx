import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
  head: () => ({ meta: [{ title: "Audit Log — EKB" }] }),
});

function AuditPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const allowed = role === "super_admin" || role === "admin" || role === "auditor";

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit"],
    enabled: allowed,
    queryFn: async () => (await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });

  useEffect(() => { if (!loading && role && !allowed) navigate({ to: "/dashboard" }); }, [loading, role, allowed, navigate]);
  if (loading || !role) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!allowed) return null;


  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Recent system activity (last 200 events)" />
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
            <th className="px-4 py-3">When</th>
            <th className="px-4 py-3">Action</th>
            <th className="px-4 py-3">Table</th>
            <th className="px-4 py-3">Record</th>
            <th className="px-4 py-3">Actor</th>
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && logs.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No activity</td></tr>}
            {logs.map((l: any) => (
              <tr key={l.id} className="border-b border-border last:border-0 font-mono text-xs">
                <td className="px-4 py-3">{fmtDate(l.created_at)} {new Date(l.created_at).toLocaleTimeString()}</td>
                <td className="px-4 py-3">{l.action}</td>
                <td className="px-4 py-3">{l.table_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{l.record_id?.slice(0, 8)}</td>
                <td className="px-4 py-3 text-muted-foreground">{l.actor_id?.slice(0, 8) ?? "system"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

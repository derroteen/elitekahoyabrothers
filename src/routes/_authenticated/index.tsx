import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — EKB" }] }),
});

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="relative bg-card rounded-xl p-5 border border-border overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gold" />
      <div className="absolute right-4 top-4 text-3xl opacity-10">{icon}</div>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{label}</div>
      <div className="font-mono text-2xl font-medium mt-2">{value}</div>
    </div>
  );
}

function Dashboard() {
  const { profile, role } = useAuth();
  return (
    <div>
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="font-serif text-2xl font-bold">Welcome, {profile?.full_name?.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Savings · Loans · Accountability · Growth</p>
        </div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{role?.replace("_"," ")}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        <StatCard label="Total Members" value="—" icon="👥" />
        <StatCard label="Total Savings" value="KES 0.00" icon="💰" />
        <StatCard label="Active Loans" value="—" icon="🏦" />
        <StatCard label="Overdue Loans" value="—" icon="⚠️" />
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-serif text-lg font-bold mb-3">Phase 1 ready</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Authentication, roles, database schema, and the navy/gold portal shell are live.
          Phase 2 (Passbook, Loans, Savings, Members management, Announcements, Notifications)
          and Phase 3 (Dashboards data, Audit log viewer, PDF/Excel exports) are next.
        </p>
      </div>
    </div>
  );
}

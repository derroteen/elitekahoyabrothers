import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fmtKES, fmtDate } from "@/lib/format";
import { fetchOpeningBalance } from "@/lib/opening-balances";

export const Route = createFileRoute("/_authenticated/dashboard")({
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
  const { user, profile, role } = useAuth();
  const isStaff = role === "super_admin" || role === "admin" || role === "auditor";
  const isMember = role === "member";

  const { data: myOpening } = useQuery({
    queryKey: ["my-opening-balance", user?.id],
    enabled: !!user && isMember,
    queryFn: () => fetchOpeningBalance(user!.id),
  });

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", role],
    enabled: isStaff,
    queryFn: async () => {
      const { fetchNonMemberIds } = await import("@/lib/member-queries");
      const nonMembers = await fetchNonMemberIds();
      const excludeFilter = nonMembers.size
        ? `(${Array.from(nonMembers).join(",")})`
        : null;
      const buildProfiles = () => {
        let q = supabase.from("profiles").select("id", { count: "exact", head: true });
        if (excludeFilter) q = q.not("id", "in", excludeFilter);
        return q;
      };
      const buildActive = () => {
        let q = supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true);
        if (excludeFilter) q = q.not("id", "in", excludeFilter);
        return q;
      };
      const [members, active, loans, pending, savings, announce, openings] = await Promise.all([
        buildProfiles(),
        buildActive(),
        supabase.from("loans").select("balance, amount_paid, status"),
        supabase.from("loans").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("passbook_entries").select("balance, entry_date, member_id"),
        supabase.from("announcements").select("id", { count: "exact", head: true }),
        supabase.from("member_opening_balances").select("member_id, opening_savings, opening_loan"),
      ]);
      const allLoans = loans.data ?? [];
      const allOpenings = openings.data ?? [];
      const openingLoanTotal = allOpenings.reduce((s: number, o: any) => s + Number(o.opening_loan ?? 0), 0);
      const totalLoans = allLoans.reduce((s, l: any) => s + Number(l.balance ?? 0), 0) + openingLoanTotal;
      const revenue = allLoans.reduce((s, l: any) => s + Number(l.amount_paid ?? 0), 0);
      const activeLoans = allLoans.filter((l: any) => l.status === "active" || l.status === "approved").length;

      // Sum latest balance per member from passbook
      const latestByMember = new Map<string, { date: string; balance: number }>();
      for (const e of savings.data ?? []) {
        const prev = latestByMember.get(e.member_id);
        if (!prev || e.entry_date > prev.date) latestByMember.set(e.member_id, { date: e.entry_date, balance: Number(e.balance) });
      }
      let totalSavings = Array.from(latestByMember.values()).reduce((s, x) => s + x.balance, 0);
      // Add opening savings for members with no passbook entries yet
      for (const o of allOpenings as any[]) {
        if (!latestByMember.has(o.member_id)) totalSavings += Number(o.opening_savings ?? 0);
      }

      return {
        members: members.count ?? 0,
        active: active.count ?? 0,
        totalLoans,
        activeLoans,
        pending: pending.count ?? 0,
        revenue,
        totalSavings,
        announcements: announce.count ?? 0,
      };
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="font-serif text-2xl font-bold">Welcome, {profile?.full_name?.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Savings · Loans · Accountability · Growth</p>
        </div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{role?.replace("_", " ")}</div>
      </div>

      {isStaff && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
          <StatCard label="Total Members" value={String(stats?.members ?? "—")} icon="👥" />
          <StatCard label="Active Members" value={String(stats?.active ?? "—")} icon="✅" />
          <StatCard label="Total Savings" value={stats ? fmtKES(stats.totalSavings) : "—"} icon="💰" />
          <StatCard label="Outstanding Loans" value={stats ? fmtKES(stats.totalLoans) : "—"} icon="🏦" />
          <StatCard label="Active Loans" value={String(stats?.activeLoans ?? "—")} icon="📈" />
          <StatCard label="Pending Loans" value={String(stats?.pending ?? "—")} icon="⏳" />
          <StatCard label="Revenue (Paid)" value={stats ? fmtKES(stats.revenue) : "—"} icon="💵" />
          <StatCard label="Announcements" value={String(stats?.announcements ?? "—")} icon="📣" />
        </div>
      )}

      {isMember && myOpening && (
        <div className="mb-7">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-serif text-lg font-bold">Brought Forward Balances</h2>
            <span className="text-xs text-muted-foreground">
              As of {fmtDate(myOpening.effective_date)}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Savings B/F" value={fmtKES(myOpening.opening_savings)} icon="💰" />
            <StatCard label="Loan B/F" value={fmtKES(myOpening.opening_loan)} icon="🏦" />
            <StatCard label="Fine B/F" value={fmtKES(myOpening.opening_fine)} icon="⚠️" />
            <StatCard label="Insurance B/F" value={fmtKES(myOpening.opening_insurance)} icon="🛡️" />
            <StatCard label="Benevolent B/F" value={fmtKES(myOpening.opening_benevolent)} icon="🤝" />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            These balances were carried over from before the website was launched and are
            the starting point for all your future calculations.
          </p>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-serif text-lg font-bold mb-3">Elite Kahoya Brothers</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Use the sidebar to manage members, passbooks, loans, savings, and announcements.
        </p>
      </div>
    </div>
  );
}

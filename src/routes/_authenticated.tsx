import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Home, Users, BookOpen, Banknote, PiggyBank, Megaphone, FileBarChart, Settings, ShieldCheck, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

const NAV: Record<AppRole, { to: string; label: string; icon: any }[]> = {
  super_admin: [
    { to: "/", label: "Dashboard", icon: Home },
    { to: "/members", label: "Members", icon: Users },
    { to: "/passbook", label: "Passbook", icon: BookOpen },
    { to: "/loans", label: "Loans", icon: Banknote },
    { to: "/savings", label: "Savings", icon: PiggyBank },
    { to: "/announcements", label: "Announcements", icon: Megaphone },
    { to: "/reports", label: "Reports", icon: FileBarChart },
    { to: "/audit", label: "Audit Log", icon: ShieldCheck },
    { to: "/settings", label: "Settings", icon: Settings },
  ],
  admin: [
    { to: "/", label: "Dashboard", icon: Home },
    { to: "/members", label: "Members", icon: Users },
    { to: "/passbook", label: "Passbook", icon: BookOpen },
    { to: "/loans", label: "Loans", icon: Banknote },
    { to: "/savings", label: "Savings", icon: PiggyBank },
    { to: "/announcements", label: "Announcements", icon: Megaphone },
    { to: "/reports", label: "Reports", icon: FileBarChart },
    { to: "/settings", label: "Settings", icon: Settings },
  ],
  auditor: [
    { to: "/", label: "Dashboard", icon: Home },
    { to: "/passbook", label: "Passbooks", icon: BookOpen },
    { to: "/reports", label: "Reports", icon: FileBarChart },
    { to: "/audit", label: "Audit Log", icon: ShieldCheck },
    { to: "/settings", label: "Settings", icon: Settings },
  ],
  member: [
    { to: "/", label: "Dashboard", icon: Home },
    { to: "/my-passbook", label: "My Passbook", icon: BookOpen },
    { to: "/my-loans", label: "My Loans", icon: Banknote },
    { to: "/my-savings", label: "My Savings", icon: PiggyBank },
    { to: "/announcements", label: "Announcements", icon: Megaphone },
    { to: "/settings", label: "Settings", icon: Settings },
  ],
};

function AuthLayout() {
  const { user, profile, role, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!user) { navigate({ to: "/login" }); return null; }
  if (profile?.must_change_password && pathname !== "/change-password") {
    navigate({ to: "/change-password" }); return null;
  }
  if (!role) return <div className="min-h-screen flex items-center justify-center">No role assigned.</div>;

  const items = NAV[role] ?? [];
  const initials = (profile?.full_name ?? "?").split(" ").map(s=>s[0]).join("").slice(0,2).toUpperCase();
  const logout = async () => { await supabase.auth.signOut(); navigate({ to: "/login" }); };

  return (
    <div className="flex min-h-screen">
      <aside className="w-[240px] bg-navy fixed h-screen left-0 top-0 z-50 flex flex-col">
        <div className="px-5 pt-7 pb-6 border-b border-gold/20">
          <div className="font-serif text-[15px] font-black text-gold leading-tight">Elite Kahoya<br/>Brothers</div>
          <div className="text-[10px] text-white/40 tracking-[2px] uppercase mt-1">Members Portal</div>
        </div>
        <nav className="flex-1 p-3 overflow-y-auto">
          {items.map((it) => {
            const active = pathname === it.to;
            const Icon = it.icon;
            return (
              <Link key={it.to} to={it.to}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-[13.5px] mb-0.5 transition ${
                  active ? "bg-gold/15 text-gold font-medium" : "text-white/60 hover:bg-gold/10 hover:text-white/90"
                }`}>
                <Icon className="w-4 h-4" />
                <span>{it.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/10 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-gold-3 flex items-center justify-center text-navy text-xs font-bold">{initials}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-white/80 font-medium truncate">{profile?.full_name}</div>
            <div className="text-[10px] text-white/35 uppercase tracking-wider">{role.replace("_"," ")}</div>
          </div>
          <button onClick={logout} className="text-white/30 hover:text-white/80 p-1" title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>
      <main className="ml-[240px] flex-1 p-7 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}

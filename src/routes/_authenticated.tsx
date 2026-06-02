import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Home, Users, BookOpen, Banknote, PiggyBank, Megaphone, FileBarChart, Settings, ShieldCheck, LogOut, Menu, X, Database } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

type NavItem = { to: string; label: string; icon: any };

const NAV: Record<AppRole, NavItem[]> = {
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
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const { data: settings } = useQuery({
    queryKey: ["system-settings"],
    enabled: !!user && role === "super_admin",
    queryFn: async () => {
      const { data } = await supabase.from("system_settings").select("development_mode").eq("id", true).maybeSingle();
      return data;
    },
  });

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!user) { navigate({ to: "/login" }); return null; }
  if (profile?.must_change_password && pathname !== "/change-password") {
    navigate({ to: "/change-password" }); return null;
  }
  if (!role) return <div className="min-h-screen flex items-center justify-center">No role assigned.</div>;

  const items: NavItem[] = [...(NAV[role] ?? [])];
  if (role === "super_admin" && settings?.development_mode) {
    // Insert before Settings
    const idx = items.findIndex((i) => i.to === "/settings");
    const entry = { to: "/system-reset", label: "System Reset", icon: Database };
    if (idx >= 0) items.splice(idx, 0, entry); else items.push(entry);
  }

  const initials = (profile?.full_name ?? "?").split(" ").map(s=>s[0]).join("").slice(0,2).toUpperCase();
  const logout = async () => { await supabase.auth.signOut(); navigate({ to: "/login" }); };

  const SidebarInner = (
    <>
      <div className="px-5 pt-7 pb-6 border-b border-gold/20 flex items-center justify-between">
        <div>
          <div className="font-serif text-[15px] font-black text-gold leading-tight">Elite Kahoya<br/>Brothers</div>
          <div className="text-[10px] text-white/40 tracking-[2px] uppercase mt-1">Members Portal</div>
        </div>
        <button className="md:hidden text-white/60 hover:text-white" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X className="w-5 h-5" />
        </button>
      </div>
      <nav className="flex-1 p-3 overflow-y-auto">
        {items.map((it) => {
          const active = pathname === it.to;
          const Icon = it.icon;
          return (
            <Link key={it.to} to={it.to}
              className={`flex items-center gap-2.5 px-3 py-3 md:py-2.5 rounded-md text-sm md:text-[13.5px] mb-0.5 transition ${
                active ? "bg-gold/15 text-gold font-medium" : "text-white/60 hover:bg-gold/10 hover:text-white/90"
              }`}>
              <Icon className="w-4 h-4 shrink-0" />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-white/10 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-gold-3 flex items-center justify-center text-navy text-xs font-bold shrink-0">{initials}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-white/80 font-medium truncate">{profile?.full_name}</div>
          <div className="text-[10px] text-white/35 uppercase tracking-wider">{role.replace("_"," ")}</div>
        </div>
        <button onClick={logout} className="text-white/30 hover:text-white/80 p-1" title="Sign out" aria-label="Sign out">
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden">
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-navy border-b border-gold/20 flex items-center justify-between px-4">
        <button onClick={() => setMobileOpen(true)} className="text-white p-2 -ml-2" aria-label="Open menu">
          <Menu className="w-6 h-6" />
        </button>
        <div className="font-serif text-sm font-black text-gold">Elite Kahoya Brothers</div>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-gold-3 flex items-center justify-center text-navy text-xs font-bold">{initials}</div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[240px] bg-navy fixed h-screen left-0 top-0 z-50 flex-col">
        {SidebarInner}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[78%] max-w-[300px] bg-navy flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
            {SidebarInner}
          </aside>
        </div>
      )}

      <main className="flex-1 min-h-screen w-full md:ml-[240px] pt-14 md:pt-0 p-4 sm:p-6 md:p-7">
        <Outlet />
      </main>
    </div>
  );
}

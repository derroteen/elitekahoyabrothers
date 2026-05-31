import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Sign in — Elite Kahoya Brothers" }] }),
});

// "superadmin" username maps to a synthetic email.
function resolveEmail(credential: string): string {
  const c = credential.trim();
  if (c.includes("@")) return c.toLowerCase();
  return `${c.toLowerCase()}@ekb.local`;
}

function LoginPage() {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const [credential, setCredential] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    if (profile?.must_change_password) navigate({ to: "/change-password" });
    else navigate({ to: "/" });
  }, [user, profile, loading, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setSubmitting(true);
    const email = resolveEmail(credential);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (err) { setError("Invalid credentials. Please try again."); return; }
    toast.success("Welcome back");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy px-4"
         style={{ backgroundImage: "radial-gradient(circle at 20% 50%, oklch(0.74 0.115 85 / 0.08) 0%, transparent 50%), radial-gradient(circle at 80% 20%, oklch(0.55 0.16 245 / 0.12) 0%, transparent 50%)" }}>
      <div className="w-[380px] bg-card rounded-2xl p-10 shadow-2xl">
        <div className="text-center mb-7">
          <div className="font-serif text-2xl font-black text-navy leading-tight">
            Elite Kahoya<br/>Brothers
          </div>
          <div className="w-10 h-[3px] bg-gold mx-auto my-3" />
          <div className="text-xs text-muted-foreground tracking-[2px] uppercase">Members Portal</div>
        </div>

        {error && <div className="bg-red-100 text-red-800 px-3.5 py-2.5 rounded-md text-sm mb-4">{error}</div>}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Username / Email</label>
            <input
              className="w-full px-3.5 py-2.5 border-[1.5px] border-border rounded-md text-sm outline-none focus:border-blue"
              value={credential} onChange={(e) => setCredential(e.target.value)}
              placeholder="superadmin or you@example.com" autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Password</label>
            <input type="password"
              className="w-full px-3.5 py-2.5 border-[1.5px] border-border rounded-md text-sm outline-none focus:border-blue"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" disabled={submitting}
            className="w-full bg-gold text-navy font-semibold py-2.5 rounded-md hover:bg-gold-2 transition disabled:opacity-60">
            {submitting ? "Signing in…" : "Sign In →"}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          <Link to="/forgot-password" className="hover:text-foreground">Forgot password?</Link>
        </div>
        <p className="text-center text-[11px] text-muted-foreground mt-3">
          Super Admin: <span className="font-mono">superadmin</span> / <span className="font-mono">admin1234</span>
        </p>
      </div>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/change-password")({
  component: ChangePasswordPage,
  head: () => ({ meta: [{ title: "Change password — EKB" }] }),
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user, loading, refresh } = useAuth();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) navigate({ to: "/login" }); }, [user, loading, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError("Password must be at least 8 characters.");
    if (pw !== confirm) return setError("Passwords do not match.");
    setSubmitting(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    if (err) { setSubmitting(false); return setError(err.message); }
    await supabase.from("profiles").update({ must_change_password: false }).eq("id", user!.id);
    await refresh();
    toast.success("Password updated");
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy px-4">
      <div className="w-[380px] bg-card rounded-2xl p-10 shadow-2xl">
        <div className="text-center mb-6">
          <div className="font-serif text-xl font-black text-navy">Set a new password</div>
          <div className="w-10 h-[3px] bg-gold mx-auto my-3" />
          <p className="text-xs text-muted-foreground">For security, please change your password to continue.</p>
        </div>
        {error && <div className="bg-red-100 text-red-800 px-3.5 py-2.5 rounded-md text-sm mb-4">{error}</div>}
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">New password</label>
            <input type="password" value={pw} onChange={(e)=>setPw(e.target.value)}
              className="w-full px-3.5 py-2.5 border-[1.5px] border-border rounded-md text-sm outline-none focus:border-blue" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Confirm password</label>
            <input type="password" value={confirm} onChange={(e)=>setConfirm(e.target.value)}
              className="w-full px-3.5 py-2.5 border-[1.5px] border-border rounded-md text-sm outline-none focus:border-blue" />
          </div>
          <button type="submit" disabled={submitting}
            className="w-full bg-gold text-navy font-semibold py-2.5 rounded-md hover:bg-gold-2 disabled:opacity-60">
            {submitting ? "Updating…" : "Change password & continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

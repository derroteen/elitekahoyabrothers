import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPage,
  head: () => ({
    meta: [
      { title: "Set new password — Elite Kahoya Brothers" },
      { name: "description", content: "Set a new password to finish recovering your EKB members portal account." },
      { property: "og:title", content: "Set new password — Elite Kahoya Brothers" },
      { property: "og:description", content: "Choose a new password for your EKB account." },
      { property: "og:url", content: "https://www.elitekahoyabrothers.com/reset-password" },
      { name: "robots", content: "noindex,nofollow" },
    ],
    links: [{ rel: "canonical", href: "https://www.elitekahoyabrothers.com/reset-password" }],
  }),
});

function ResetPage() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError("Password must be at least 8 characters.");
    if (pw !== confirm) return setError("Passwords do not match.");
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    if (err) return setError(err.message);
    toast.success("Password updated");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy px-4">
      <div className="w-[380px] bg-card rounded-2xl p-10 shadow-2xl">
        <header className="text-center mb-6">
          <h1 className="font-serif text-xl font-black text-navy">Set new password</h1>
          <div className="w-10 h-[3px] bg-gold mx-auto my-3" />
        </header>
        {error && <div className="bg-red-100 text-red-800 px-3.5 py-2.5 rounded-md text-sm mb-4">{error}</div>}
        <form onSubmit={submit} className="space-y-4">
          <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="New password"
            className="w-full px-3.5 py-2.5 border-[1.5px] border-border rounded-md text-sm outline-none focus:border-blue" />
          <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Confirm password"
            className="w-full px-3.5 py-2.5 border-[1.5px] border-border rounded-md text-sm outline-none focus:border-blue" />
          <button type="submit" className="w-full bg-gold text-navy font-semibold py-2.5 rounded-md hover:bg-gold-2">Update password</button>
        </form>
      </div>
    </div>
  );
}

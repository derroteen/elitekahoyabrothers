import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPage,
  head: () => ({
    meta: [
      { title: "Forgot password — Elite Kahoya Brothers" },
      { name: "description", content: "Request a password reset link for your Elite Kahoya Brothers members portal account." },
      { property: "og:title", content: "Forgot password — Elite Kahoya Brothers" },
      { property: "og:description", content: "Recover access to your EKB members portal account." },
      { property: "og:url", content: "https://www.elitekahoyabrothers.com/forgot-password" },
    ],
    links: [{ rel: "canonical", href: "https://www.elitekahoyabrothers.com/forgot-password" }],
  }),
});

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (err) setError(err.message);
    else setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy px-4">
      <div className="w-[380px] bg-card rounded-2xl p-10 shadow-2xl">
        <header className="text-center mb-6">
          <h1 className="font-serif text-xl font-black text-navy">Reset password</h1>
          <div className="w-10 h-[3px] bg-gold mx-auto my-3" />
        </header>
        {sent ? (
          <p className="text-sm text-muted-foreground">If an account exists for {email}, a reset link has been sent.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && <div className="bg-red-100 text-red-800 px-3.5 py-2.5 rounded-md text-sm">{error}</div>}
            <input type="email" required value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3.5 py-2.5 border-[1.5px] border-border rounded-md text-sm outline-none focus:border-blue" />
            <button type="submit" className="w-full bg-gold text-navy font-semibold py-2.5 rounded-md hover:bg-gold-2">
              Send reset link
            </button>
          </form>
        )}
        <div className="mt-4 text-center text-xs">
          <Link to="/login" className="text-muted-foreground hover:text-foreground">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { resetTestData, setSystemMode } from "@/lib/system.functions";

export const Route = createFileRoute("/_authenticated/system-reset")({
  component: SystemResetPage,
  head: () => ({ meta: [{ title: "System Reset — EKB" }] }),
});

function SystemResetPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const reset = useServerFn(resetTestData);
  const setMode = useServerFn(setSystemMode);

  if (role !== "super_admin") { navigate({ to: "/" }); return null; }

  const { data: settings, refetch } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("system_settings").select("*").eq("id", true).maybeSingle();
      return data;
    },
  });

  const devMode = settings?.development_mode ?? true;

  const onToggle = async (val: boolean) => {
    try { await setMode({ data: { development_mode: val } }); toast.success(val ? "Development mode ON" : "Production mode ON"); refetch(); qc.invalidateQueries({ queryKey: ["system-settings"] }); }
    catch (e: any) { toast.error(e.message); }
  };

  const onReset = async () => {
    if (confirm !== "RESET") { toast.error('Type "RESET" to confirm'); return; }
    if (!password) { toast.error("Password required"); return; }
    setSubmitting(true);
    try {
      await reset({ data: { password } });
      toast.success("Test data cleared. Membership counter reset to EKB001.");
      setPassword(""); setConfirm("");
      qc.invalidateQueries();
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="System Reset" subtitle="Super Admin · Development Tools" />

      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium">Development Mode</div>
            <p className="text-sm text-muted-foreground mt-1">When on, this page is available and test data can be reset. Turn off for production.</p>
          </div>
          <Switch checked={devMode} onCheckedChange={onToggle} />
        </div>
        <div className={`mt-3 text-xs uppercase tracking-wider font-medium ${devMode ? "text-amber-600" : "text-green-600"}`}>
          Current: {devMode ? "Development" : "Production"}
        </div>
      </Card>

      {devMode ? (
        <Card className="p-5 border-red-200">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-serif text-lg font-bold text-red-700">Reset Test Data</h2>
              <p className="text-sm text-muted-foreground mt-1">
                This permanently deletes <b>all members (except Super Admins)</b>, passbook entries, savings, loans, repayments, announcements, and notifications. Database structure, RLS policies and Super Admin accounts are preserved. Membership numbering restarts from <b>EKB001</b>. This cannot be undone.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Your password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Confirm with your password" />
            </div>
            <div>
              <Label>Type <span className="font-mono">RESET</span> to confirm</Label>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="RESET" />
            </div>
            <Button onClick={onReset} disabled={submitting} variant="destructive" className="w-full sm:w-auto">
              {submitting ? "Resetting…" : "Permanently delete test data"}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Reset is disabled in Production Mode. Switch to Development Mode above to enable it.</p>
        </Card>
      )}
    </div>
  );
}

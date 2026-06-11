import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings — EKB" }] }),
});

function SettingsPage() {
  const { profile, user } = useAuth();
  const { theme, toggle } = useTheme();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName, phone }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Profile updated");
  };

  const changePwd = async () => {
    if (pwd.length < 8) { toast.error("Password must be at least 8 chars"); return; }
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) toast.error(error.message);
    else { toast.success("Password updated"); setPwd(""); }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Manage your profile, password, and preferences" />
      <Card className="p-6 mb-4 space-y-3">
        <h2 className="font-serif text-lg text-navy dark:text-gold">Profile</h2>
        <div><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
        <div><Label>Email</Label><Input value={user?.email ?? ""} disabled /></div>
        <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <Button onClick={saveProfile} disabled={saving} className="bg-navy text-white hover:bg-navy-2">{saving ? "Saving…" : "Save"}</Button>
      </Card>
      <Card className="p-6 mb-4 space-y-3">
        <h2 className="font-serif text-lg text-navy dark:text-gold">Change Password</h2>
        <div><Label>New password</Label><Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} /></div>
        <Button onClick={changePwd} className="bg-navy text-white hover:bg-navy-2">Update Password</Button>
      </Card>
      <Card className="p-6 space-y-3">
        <h2 className="font-serif text-lg text-navy dark:text-gold">Appearance</h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {theme === "dark" ? <Moon className="w-5 h-5 text-navy dark:text-gold" /> : <Sun className="w-5 h-5 text-navy dark:text-gold" />}
            <div>
              <div className="text-sm font-medium">Dark Mode</div>
              <div className="text-xs text-muted-foreground">Switch between light and dark theme</div>
            </div>
          </div>
          <Switch checked={theme === "dark"} onCheckedChange={toggle} />
        </div>
      </Card>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { adminCreateMember } from "@/lib/members.functions";

export const Route = createFileRoute("/_authenticated/members")({
  component: MembersPage,
  head: () => ({ meta: [{ title: "Members — EKB" }] }),
});

function MembersPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  if (role !== "super_admin" && role !== "admin") {
    navigate({ to: "/" });
    return null;
  }

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, membership_no, is_active, date_joined, user_roles(role)")
        .order("membership_no", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member updated");
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = members.filter((m: any) =>
    !q ||
    m.full_name?.toLowerCase().includes(q.toLowerCase()) ||
    m.email?.toLowerCase().includes(q.toLowerCase()) ||
    m.membership_no?.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Members"
        subtitle={`${members.length} registered members`}
        actions={<Button onClick={() => setOpen(true)} className="bg-navy text-white hover:bg-navy-2">+ New Member</Button>}
      />
      <Card className="p-4 mb-4">
        <Input placeholder="Search by name, email, or membership #" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="px-4 py-3">Member #</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && filtered.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No members</td></tr>}
            {filtered.map((m: any) => (
              <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                <td className="px-4 py-3 font-mono text-xs">{m.membership_no ?? "—"}</td>
                <td className="px-4 py-3 font-medium">{m.full_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{m.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{m.phone ?? "—"}</td>
                <td className="px-4 py-3 text-xs uppercase tracking-wider">{m.user_roles?.[0]?.role?.replace("_", " ") ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(m.date_joined)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${m.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {m.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm" onClick={() => toggleActive.mutate({ id: m.id, is_active: !m.is_active })}>
                    {m.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <NewMemberDialog open={open} onOpenChange={setOpen} onCreated={() => qc.invalidateQueries({ queryKey: ["members"] })} canSetRole={role === "super_admin"} />
    </div>
  );
}

function NewMemberDialog({ open, onOpenChange, onCreated, canSetRole }: { open: boolean; onOpenChange: (b: boolean) => void; onCreated: () => void; canSetRole: boolean }) {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "", role: "member" });
  const [submitting, setSubmitting] = useState(false);
  const createMember = useServerFn(adminCreateMember);

  const submit = async () => {
    if (!form.full_name || !form.email || !form.password) { toast.error("Name, email, password required"); return; }
    setSubmitting(true);
    try {
      await createMember({
        data: {
          full_name: form.full_name,
          email: form.email,
          phone: form.phone || null,
          password: form.password,
          role: form.role as "member" | "auditor" | "admin",
        },
      });
      toast.success("Member created. They must change password on first login.");
      setForm({ full_name: "", email: "", phone: "", password: "", role: "member" });
      onOpenChange(false);
      onCreated();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create member");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">New Member</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Temporary password</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          {canSetRole && (
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="auditor">Auditor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-navy text-white hover:bg-navy-2">{submitting ? "Creating…" : "Create Member"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

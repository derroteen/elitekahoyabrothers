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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import {
  adminCreateMember,
  adminUpdateMember,
  adminResetPassword,
  adminSetActive,
  adminDeleteUser,
  adminSetRole,
} from "@/lib/members.functions";
import { MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/members")({
  component: MembersPage,
  head: () => ({ meta: [{ title: "Members — EKB" }] }),
});

type RoleFilter = "all" | "member" | "auditor" | "admin" | "super_admin";
type StatusFilter = "all" | "active" | "inactive";

function MembersPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<any>(null);
  const [resetting, setResetting] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);

  const isStaff = role === "super_admin" || role === "admin";

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["members"],
    enabled: isStaff,
    queryFn: async () => {
      const [pRes, rRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, phone, membership_no, is_active, date_joined")
          .order("membership_no", { ascending: true, nullsFirst: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (pRes.error) throw pRes.error;
      if (rRes.error) throw rRes.error;
      const roleMap = new Map((rRes.data ?? []).map((r: any) => [r.user_id, r.role]));
      return (pRes.data ?? []).map((p: any) => ({ ...p, user_roles: [{ role: roleMap.get(p.id) ?? "member" }] }));
    },
  });

  const setActive = useServerFn(adminSetActive);

  useEffect(() => {
    if (!loading && role && !isStaff) navigate({ to: "/dashboard" });
  }, [loading, role, isStaff, navigate]);

  if (loading || !role) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isStaff) return null;
  const isSuper = role === "super_admin";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["members"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };


  const filtered = members.filter((m: any) => {
    const r = m.user_roles?.[0]?.role;
    if (roleFilter !== "all" && r !== roleFilter) return false;
    if (statusFilter === "active" && !m.is_active) return false;
    if (statusFilter === "inactive" && m.is_active) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      m.full_name?.toLowerCase().includes(s) ||
      m.email?.toLowerCase().includes(s) ||
      m.phone?.toLowerCase().includes(s) ||
      m.membership_no?.toLowerCase().includes(s)
    );
  });

  return (
    <div>
      <PageHeader
        title="Members"
        subtitle={`${members.length} registered · ${filtered.length} shown`}
        actions={<Button onClick={() => setOpen(true)} className="bg-navy text-white hover:bg-navy-2">+ New Member</Button>}
      />
      <Card className="p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <Label className="text-xs">Search</Label>
          <Input placeholder="Name, email, phone, or membership #" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Role</Label>
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="auditor">Auditor</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="super_admin">Super Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>
      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="px-4 py-3">Member #</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3 hidden md:table-cell">Email</th>
              <th className="px-4 py-3 hidden sm:table-cell">Phone</th>
              <th className="px-4 py-3 hidden lg:table-cell">Role</th>
              <th className="px-4 py-3 hidden lg:table-cell">Joined</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && filtered.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No members</td></tr>}
            {filtered.map((m: any) => {
              const r = m.user_roles?.[0]?.role;
              const isStaffTarget = r === "admin" || r === "super_admin";
              const canToggleActive = !isStaffTarget || isSuper;
              const canResetPw = !isStaffTarget || isSuper;
              return (
                <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono text-xs">{m.membership_no ?? "—"}</td>
                  <td className="px-4 py-3 font-medium">
                    <div>{m.full_name}</div>
                    <div className="md:hidden text-xs text-muted-foreground truncate max-w-[180px]">{m.email}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{m.email}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{m.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-xs uppercase tracking-wider hidden lg:table-cell">{r?.replace("_", " ") ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{fmtDate(m.date_joined)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${m.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {m.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" aria-label="Member actions"><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing(m)}>Edit details</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setResetting(m)}>Reset password</DropdownMenuItem>
                        {canToggleActive && (
                          <DropdownMenuItem
                            onClick={async () => {
                              try { await setActive({ data: { id: m.id, is_active: !m.is_active } }); toast.success(m.is_active ? "Deactivated" : "Reactivated"); refresh(); }
                              catch (e: any) { toast.error(e.message); }
                            }}>
                            {m.is_active ? "Deactivate" : "Reactivate"}
                          </DropdownMenuItem>
                        )}
                        {isSuper && <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600" onClick={() => setDeleting(m)}>Delete user</DropdownMenuItem>
                        </>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </Card>
      <NewMemberDialog open={open} onOpenChange={setOpen} onCreated={refresh} canSetRole={isSuper} />
      {editing && <EditDialog member={editing} onClose={() => setEditing(null)} onSaved={refresh} canSetRole={isSuper} />}
      {resetting && <ResetPasswordDialog member={resetting} onClose={() => setResetting(null)} />}
      {deleting && <DeleteDialog member={deleting} onClose={() => setDeleting(null)} onDone={refresh} />}
    </div>
  );
}

function NewMemberDialog({ open, onOpenChange, onCreated, canSetRole }: { open: boolean; onOpenChange: (b: boolean) => void; onCreated: () => void; canSetRole: boolean }) {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "", role: "member" });
  const [submitting, setSubmitting] = useState(false);
  const createMember = useServerFn(adminCreateMember);

  const submit = async () => {
    if (!form.full_name || !form.password) { toast.error("Name and password are required"); return; }
    setSubmitting(true);
    try {
      await createMember({ data: { ...form, phone: form.phone || null, role: form.role as any } });
      toast.success("Member created. They must change password on first login.");
      setForm({ full_name: "", email: "", phone: "", password: "", role: "member" });
      onOpenChange(false); onCreated();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setSubmitting(false); }
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

function EditDialog({ member, onClose, onSaved, canSetRole }: any) {
  const [form, setForm] = useState({ full_name: member.full_name ?? "", email: member.email ?? "", phone: member.phone ?? "", role: member.user_roles?.[0]?.role ?? "member" });
  const [submitting, setSubmitting] = useState(false);
  const update = useServerFn(adminUpdateMember);
  const setRole = useServerFn(adminSetRole);

  const submit = async () => {
    setSubmitting(true);
    try {
      await update({ data: { id: member.id, full_name: form.full_name, phone: form.phone || null, email: form.email } });
      if (canSetRole && form.role !== member.user_roles?.[0]?.role) {
        await setRole({ data: { id: member.id, role: form.role } });
      }
      toast.success("Member updated"); onClose(); onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">Edit Member</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          {canSetRole && (
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="auditor">Auditor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-navy text-white hover:bg-navy-2">{submitting ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ member, onClose }: any) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const reset = useServerFn(adminResetPassword);
  const submit = async () => {
    if (password.length < 6) { toast.error("Min 6 characters"); return; }
    setSubmitting(true);
    try { await reset({ data: { id: member.id, password } }); toast.success("Password reset. User must change on next login."); onClose(); }
    catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">Reset Password</DialogTitle>
          <DialogDescription>Set a new temporary password for {member.full_name}. They will be required to change it on next login.</DialogDescription>
        </DialogHeader>
        <div><Label>Temporary password</Label><Input value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-navy text-white hover:bg-navy-2">{submitting ? "Saving…" : "Reset"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ member, onClose, onDone }: any) {
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const del = useServerFn(adminDeleteUser);
  const submit = async () => {
    if (confirm !== member.full_name) { toast.error("Type the full name to confirm"); return; }
    setSubmitting(true);
    try { await del({ data: { id: member.id } }); toast.success("User deleted"); onClose(); onDone(); }
    catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif text-red-600">Delete User</DialogTitle>
          <DialogDescription>
            This permanently removes <b>{member.full_name}</b>'s login and profile. Financial records (passbook entries, loans, repayments) are preserved for auditing. Users with outstanding loan balances cannot be deleted.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label>Type the full name to confirm</Label>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={member.full_name} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} variant="destructive">{submitting ? "Deleting…" : "Delete permanently"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtKES, fmtDate } from "@/lib/format";
import { Trash2 } from "lucide-react";
import { deleteWeeklyCollectionEntry } from "@/lib/entries.functions";

export const Route = createFileRoute("/_authenticated/collections")({
  component: CollectionsPage,
  head: () => ({ meta: [{ title: "Weekly Collections — EKB" }] }),
});

function CollectionsPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: sheets = [], isLoading } = useQuery({
    queryKey: ["collections-list"],
    enabled: !!role && role !== "member",
    queryFn: async () => {
      const { data } = await (supabase.from("weekly_collections" as any) as any)
        .select("*").order("collection_date", { ascending: false }).order("week_number", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  useEffect(() => { if (!loading && role === "member") navigate({ to: "/dashboard" }); }, [loading, role, navigate]);

  if (loading || !role) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (role === "member") return null;
  const canEdit = role === "super_admin" || role === "admin";
  const canDelete = role === "super_admin";

  return (
    <div>
      <PageHeader title="Weekly Collection Sheet" subtitle={`${sheets.length} sheets on file`}
        actions={canEdit ? <Button onClick={() => setOpenNew(true)} className="bg-navy text-white hover:bg-navy-2">+ New Week</Button> : undefined} />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-4 py-3">Week</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Treasurer</th>
                <th className="px-4 py-3">Banked</th>
                <th className="px-4 py-3 text-right">In Advance</th>
                <th className="px-4 py-3 text-right">Cash in Hand</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && sheets.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No collection sheets yet</td></tr>}
              {sheets.map((s: any) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-semibold cursor-pointer" onClick={() => setActiveId(s.id)}>Week {s.week_number}</td>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => setActiveId(s.id)}>{fmtDate(s.collection_date)}</td>
                  <td className="px-4 py-3">{s.treasurer_name ?? "—"}</td>
                  <td className="px-4 py-3">{s.banked_by ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtKES(s.banked_in_advance)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtKES(s.cash_in_hand)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setActiveId(s.id)}>Open</Button>
                    {canDelete && <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setDeleteId(s.id)}>Delete</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <NewSheetDialog open={openNew} onOpenChange={setOpenNew} lastSheet={sheets[0]} onCreated={(id: string) => { qc.invalidateQueries({ queryKey: ["collections-list"] }); setActiveId(id); }} />
      {activeId && <SheetEditor id={activeId} onClose={() => setActiveId(null)} canEdit={canEdit} />}
      {deleteId && <DeleteSheetDialog id={deleteId} onClose={() => setDeleteId(null)} onDeleted={() => { qc.invalidateQueries({ queryKey: ["collections-list"] }); setDeleteId(null); }} />}
    </div>
  );
}

function NewSheetDialog({ open, onOpenChange, lastSheet, onCreated }: any) {
  const computeDefaults = () => {
    if (lastSheet) {
      const d = new Date(lastSheet.collection_date);
      d.setDate(d.getDate() + 7);
      return { week_number: String(Number(lastSheet.week_number) + 1), collection_date: d.toISOString().slice(0, 10), treasurer_name: "" };
    }
    return { week_number: "", collection_date: new Date().toISOString().slice(0, 10), treasurer_name: "" };
  };
  const [form, setForm] = useState(computeDefaults);
  useEffect(() => { if (open) setForm(computeDefaults()); }, [open, lastSheet?.id]);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!form.week_number) { toast.error("Week number required"); return; }
    setBusy(true);
    const { data, error } = await (supabase.from("weekly_collections" as any) as any).insert({
      week_number: Number(form.week_number),
      collection_date: form.collection_date,
      treasurer_name: form.treasurer_name || null,
    }).select("id").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Week ${form.week_number} created`);
    onOpenChange(false); onCreated(data!.id);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">New Collection Sheet</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Week Number</Label><Input type="number" value={form.week_number} onChange={(e) => setForm({ ...form, week_number: e.target.value })} placeholder="e.g. 13" /></div>
          <div><Label>Collection Date</Label><Input type="date" value={form.collection_date} onChange={(e) => setForm({ ...form, collection_date: e.target.value })} /></div>
          <div><Label>Treasurer Name</Label><Input value={form.treasurer_name} onChange={(e) => setForm({ ...form, treasurer_name: e.target.value })} placeholder="Optional" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-navy text-white hover:bg-navy-2">{busy ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SheetEditor({ id, onClose, canEdit }: { id: string; onClose: () => void; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: sheet } = useQuery({
    queryKey: ["collection-sheet", id],
    queryFn: async () => {
      const { data } = await (supabase.from("weekly_collections" as any) as any).select("*").eq("id", id).single();
      return data as any;
    },
  });
  const { data: members = [] } = useQuery({
    queryKey: ["members-lite"],
    queryFn: async () => {
      const { fetchNonMemberIds, filterMembersOnly } = await import("@/lib/member-queries");
      const [profilesRes, nonMembers] = await Promise.all([
        supabase.from("profiles").select("id, full_name, membership_no").eq("is_active", true).order("sort_order", { ascending: true, nullsFirst: false }).order("membership_no"),
        fetchNonMemberIds(),
      ]);
      return filterMembersOnly(profilesRes.data ?? [], nonMembers);
    },
  });
  const { data: entries = [], refetch: refetchEntries } = useQuery({
    queryKey: ["collection-entries", id],
    queryFn: async () => {
      const { data } = await (supabase.from("weekly_collection_entries" as any) as any).select("*").eq("collection_id", id);
      return (data ?? []) as any[];
    },
  });

  // Map member_id -> entry
  const byMember = useMemo(() => {
    const m = new Map<string, any>();
    entries.forEach((e) => m.set(e.member_id, e));
    return m;
  }, [entries]);

  // Local edit state keyed by member id
  const [draft, setDraft] = useState<Record<string, any>>({});
  const getVal = (mid: string, field: string) => {
    if (draft[mid]?.[field] !== undefined) return draft[mid][field];
    return byMember.get(mid)?.[field] ?? "";
  };
  const setVal = (mid: string, field: string, v: string) => {
    setDraft((d) => ({ ...d, [mid]: { ...(d[mid] ?? {}), [field]: v } }));
  };

  const rowTotal = (mid: string) =>
    ["savings", "loan_refund", "benevolent_fund", "fine", "insurance"].reduce(
      (s, f) => s + Number(getVal(mid, f) || 0), 0);

  const totals = useMemo(() => {
    const t = { savings: 0, loan_refund: 0, benevolent_fund: 0, fine: 0, insurance: 0, grand: 0 };
    members.forEach((m: any) => {
      t.savings += Number(getVal(m.id, "savings") || 0);
      t.loan_refund += Number(getVal(m.id, "loan_refund") || 0);
      t.benevolent_fund += Number(getVal(m.id, "benevolent_fund") || 0);
      t.fine += Number(getVal(m.id, "fine") || 0);
      t.insurance += Number(getVal(m.id, "insurance") || 0);
    });
    t.grand = t.savings + t.loan_refund + t.benevolent_fund + t.fine + t.insurance;
    return t;
  }, [draft, byMember, members]);

  const saveAll = useMutation({
    mutationFn: async () => {
      const inserts: any[] = [];
      const updates: { id: string; payload: any }[] = [];
      for (const m of members as any[]) {
        const total = rowTotal(m.id);
        const existing = byMember.get(m.id);
        const payload = {
          collection_id: id,
          member_id: m.id,
          savings: Number(getVal(m.id, "savings") || 0),
          loan_refund: Number(getVal(m.id, "loan_refund") || 0),
          benevolent_fund: Number(getVal(m.id, "benevolent_fund") || 0),
          fine: Number(getVal(m.id, "fine") || 0),
          insurance: Number(getVal(m.id, "insurance") || 0),
          total,
          remarks: getVal(m.id, "remarks") || null,
        };
        if (existing) {
          updates.push({ id: existing.id, payload });
        } else if (total > 0) {
          // Omit id so the DB default (gen_random_uuid()) fills it in
          inserts.push(payload);
        }
      }
      if (inserts.length > 0) {
        const { error } = await (supabase.from("weekly_collection_entries" as any) as any).insert(inserts);
        if (error) throw error;
      }
      for (const u of updates) {
        const { error } = await (supabase.from("weekly_collection_entries" as any) as any).update(u.payload).eq("id", u.id);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Saved"); setDraft({}); refetchEntries(); qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const saveHeader = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await (supabase.from("weekly_collections" as any) as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["collection-sheet", id] }),
    onError: (e: any) => toast.error(e.message),
  });

  if (!sheet) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Weekly Collection Sheet · Week {sheet.week_number}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><Label>Date</Label><div className="font-mono">{fmtDate(sheet.collection_date)}</div></div>
          <div>
            <Label>Treasurer</Label>
            <Input disabled={!canEdit} defaultValue={sheet.treasurer_name ?? ""} onBlur={(e) => saveHeader.mutate({ treasurer_name: e.target.value })} />
          </div>
          <div>
            <Label>Banked By</Label>
            <Input disabled={!canEdit} defaultValue={sheet.banked_by ?? ""} onBlur={(e) => saveHeader.mutate({ banked_by: e.target.value })} />
          </div>
          <div>
            <Label>Notes</Label>
            <Input disabled={!canEdit} defaultValue={sheet.notes ?? ""} onBlur={(e) => saveHeader.mutate({ notes: e.target.value })} />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto border border-border rounded-md">
          <table className="w-full text-xs min-w-[800px]">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-2 py-2 w-8">#</th>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2 w-20">Memb #</th>
                <th className="px-2 py-2 text-right">Savings</th>
                <th className="px-2 py-2 text-right">Loan Refund</th>
                <th className="px-2 py-2 text-right">Benevolent</th>
                <th className="px-2 py-2 text-right">Fine</th>
                <th className="px-2 py-2 text-right">Insurance</th>
                <th className="px-2 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m: any, i: number) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-1.5 font-medium">{m.full_name}</td>
                  <td className="px-2 py-1.5 font-mono text-muted-foreground">{m.membership_no}</td>
                  {(["savings", "loan_refund", "benevolent_fund", "fine", "insurance"] as const).map((f) => (
                    <td key={f} className="px-1 py-1">
                      <Input disabled={!canEdit} type="number" step="0.01" value={getVal(m.id, f)} onChange={(e) => setVal(m.id, f, e.target.value)}
                        className="h-8 text-right font-mono text-xs" />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-mono font-semibold">{rowTotal(m.id) > 0 ? fmtKES(rowTotal(m.id)) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/60 font-semibold">
              <tr>
                <td className="px-2 py-2" colSpan={3}>Totals</td>
                <td className="px-2 py-2 text-right font-mono">{fmtKES(totals.savings)}</td>
                <td className="px-2 py-2 text-right font-mono">{fmtKES(totals.loan_refund)}</td>
                <td className="px-2 py-2 text-right font-mono">{fmtKES(totals.benevolent_fund)}</td>
                <td className="px-2 py-2 text-right font-mono">{fmtKES(totals.fine)}</td>
                <td className="px-2 py-2 text-right font-mono">{fmtKES(totals.insurance)}</td>
                <td className="px-2 py-2 text-right font-mono text-navy">{fmtKES(totals.grand)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <div>
            <Label>Banked In Advance</Label>
            <Input disabled={!canEdit} type="number" step="0.01" defaultValue={sheet.banked_in_advance} onBlur={(e) => saveHeader.mutate({ banked_in_advance: Number(e.target.value || 0) })} />
          </div>
          <div>
            <Label>Cash In Hand</Label>
            <Input disabled={!canEdit} type="number" step="0.01" defaultValue={sheet.cash_in_hand} onBlur={(e) => saveHeader.mutate({ cash_in_hand: Number(e.target.value || 0) })} />
          </div>
          <div>
            <Label>Total Collections</Label>
            <div className="h-10 flex items-center px-3 rounded-md border border-border bg-muted/40 font-mono font-bold">
              {fmtKES(Number(sheet.banked_in_advance || 0) + Number(sheet.cash_in_hand || 0))}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {canEdit && <Button onClick={() => saveAll.mutate()} disabled={saveAll.isPending} className="bg-navy text-white hover:bg-navy-2">{saveAll.isPending ? "Saving…" : "Save Sheet"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSheetDialog({ id, onClose, onDeleted }: { id: string; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    const { error: e1 } = await (supabase.from("weekly_collection_entries" as any) as any).delete().eq("collection_id", id);
    if (e1) { setBusy(false); toast.error(e1.message); return; }
    const { error: e2 } = await (supabase.from("weekly_collections" as any) as any).delete().eq("id", id);
    setBusy(false);
    if (e2) { toast.error(e2.message); return; }
    toast.success("Week sheet deleted");
    onDeleted();
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">Delete Week Sheet?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">This permanently removes the week sheet and all of its entries. This action cannot be undone.</p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} disabled={busy} className="bg-red-600 text-white hover:bg-red-700">{busy ? "Deleting…" : "Delete Permanently"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { Pin, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/announcements")({
  component: AnnouncementsPage,
  head: () => ({ meta: [{ title: "Announcements — EKB" }] }),
});

function AnnouncementsPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const canEdit = role === "super_admin" || role === "admin";

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => (await supabase.from("announcements").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false })).data ?? [],
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("announcements").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["announcements"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Announcements" subtitle="SACCO updates and notices"
        actions={canEdit ? <Button onClick={() => setOpen(true)} className="bg-navy text-white hover:bg-navy-2">+ New Announcement</Button> : undefined} />
      <div className="space-y-3">
        {isLoading && <Card className="p-6 text-center text-muted-foreground">Loading…</Card>}
        {!isLoading && items.length === 0 && <Card className="p-6 text-center text-muted-foreground">No announcements yet</Card>}
        {items.map((a: any) => (
          <Card key={a.id} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {a.pinned && <Pin className="w-3.5 h-3.5 text-gold" />}
                  <h3 className="font-serif text-lg text-navy">{a.title}</h3>
                </div>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{a.body}</p>
                <div className="text-xs text-muted-foreground mt-3">{fmtDate(a.created_at)}</div>
              </div>
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={() => del.mutate(a.id)}><Trash2 className="w-4 h-4" /></Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      <NewAnnouncementDialog open={open} onOpenChange={setOpen} onCreated={() => qc.invalidateQueries({ queryKey: ["announcements"] })} />
    </div>
  );
}

function NewAnnouncementDialog({ open, onOpenChange, onCreated }: any) {
  const [form, setForm] = useState({ title: "", body: "", pinned: false });
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (!form.title || !form.body) { toast.error("Title and body required"); return; }
    setSubmitting(true);
    const { error } = await supabase.from("announcements").insert(form);
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Posted");
    setForm({ title: "", body: "", pinned: false });
    onOpenChange(false); onCreated();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">New Announcement</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label>Body</Label><Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
          <div className="flex items-center gap-3"><Switch checked={form.pinned} onCheckedChange={(v) => setForm({ ...form, pinned: v })} /><Label>Pin to top</Label></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-navy text-white hover:bg-navy-2">{submitting ? "Posting…" : "Post"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

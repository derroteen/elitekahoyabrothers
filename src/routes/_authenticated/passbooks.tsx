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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtDate, fmtKES } from "@/lib/format";
import { PassbookTable } from "@/components/PassbookTable";
import { createManualPassbookEntry, updatePassbookEntry, deletePassbookEntry } from "@/lib/passbook.functions";
import { forceDeletePassbookEntry } from "@/lib/entries.functions";

export const Route = createFileRoute("/_authenticated/passbooks")({
  component: PassbookAdmin,
  head: () => ({ meta: [{ title: "Passbook — EKB" }] }),
});

const MANUAL_CATEGORIES: { value: string; label: string; defaultDesc: string; field: "savings" | "bonus" | "withdrawal" | "loan_payment" | null }[] = [
  { value: "bonus", label: "Bonus Allocation", defaultDesc: "Bonus Allocation", field: "bonus" },
  { value: "dividend", label: "Dividend Payment", defaultDesc: "Dividend Payment", field: "bonus" },
  { value: "special_contribution", label: "Special Contribution", defaultDesc: "Special Contribution", field: "savings" },
  { value: "savings", label: "Savings (Ad-hoc)", defaultDesc: "Savings", field: "savings" },
  { value: "refund", label: "Refund", defaultDesc: "Refund", field: "bonus" },
  { value: "withdrawal", label: "Withdrawal", defaultDesc: "Withdrawal", field: "withdrawal" },
  { value: "adjustment", label: "Adjustment / Correction", defaultDesc: "Adjustment Entry", field: null },
  { value: "other", label: "Other", defaultDesc: "Other Entry", field: null },
];

type MemberLoanOption = {
  id: string;
  type: "loan" | "opening";
  label: string;
  total_repayable: number;
  sort_date?: string | null;
};

function PassbookAdmin() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<any>(null);

  const isStaff = role === "super_admin" || role === "admin" || role === "auditor";

  const { data: members = [] } = useQuery({
    queryKey: ["members-lite"],
    enabled: isStaff,
    queryFn: async () => {
      const { fetchNonMemberIds, filterMembersOnly } = await import("@/lib/member-queries");
      const [profilesRes, nonMembers] = await Promise.all([
        supabase.from("profiles").select("id, full_name, membership_no").order("sort_order", { ascending: true, nullsFirst: false }).order("membership_no"),
        fetchNonMemberIds(),
      ]);
      return filterMembersOnly(profilesRes.data ?? [], nonMembers);
    },
  });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["passbook", memberId],
    enabled: !!memberId && isStaff,
    queryFn: async () => {
      const { fetchOpeningBalance, withBroughtForward } = await import("@/lib/opening-balances");
      const [entriesRes, opening] = await Promise.all([
        supabase.from("passbook_entries").select("*").eq("member_id", memberId).order("entry_date", { ascending: true }),
        fetchOpeningBalance(memberId),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      return withBroughtForward(entriesRes.data ?? [], opening);
    },
  });

  const { data: memberLoans = [] } = useQuery({
    queryKey: ["passbook-member-loans", memberId],
    enabled: !!memberId && isStaff,
    queryFn: async (): Promise<MemberLoanOption[]> => {
      const [loansRes, openingRes] = await Promise.all([
        supabase
          .from("loans")
          .select("id, loan_date, balance, total_repayable, status")
          .eq("member_id", memberId)
          .order("loan_date", { ascending: true }),
        (supabase as any)
          .from("loan_opening_balances")
          .select("id, loan_date, balance, total_repayable")
          .eq("member_id", memberId)
          .order("loan_date", { ascending: true }),
      ]);
      if (loansRes.error) throw loansRes.error;
      if (openingRes.error) throw openingRes.error;

      const regularLoans = (loansRes.data ?? [])
        .filter((loan: any) => !["completed", "completed_with_fine", "rejected"].includes(String(loan.status ?? "")))
        .map((loan: any) => ({
          id: loan.id,
          type: "loan" as const,
          label: `Loan from ${fmtDate(loan.loan_date)} — ${fmtKES(Number(loan.balance ?? 0))} remaining`,
          total_repayable: Number(loan.total_repayable ?? 0),
          sort_date: loan.loan_date ?? null,
        }));

      const openingLoans = ((openingRes.data ?? []) as any[])
        .filter((loan) => Number(loan.balance ?? 0) > 0)
        .map((loan) => ({
          id: loan.id,
          type: "opening" as const,
          label: `Opening Loan — ${fmtKES(Number(loan.balance ?? 0))} remaining`,
          total_repayable: Number(loan.total_repayable ?? 0),
          sort_date: loan.loan_date ?? null,
        }));

      return [...openingLoans, ...regularLoans].sort((a, b) => String(a.sort_date ?? "").localeCompare(String(b.sort_date ?? "")));
    },
  });

  useEffect(() => { if (!loading && role && !isStaff) navigate({ to: "/dashboard" }); }, [loading, role, isStaff, navigate]);

  if (loading || !role) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isStaff) return null;

  const selectedMember = members.find((m: any) => m.id === memberId);
  const canEdit = role === "super_admin" || role === "admin";
  const canDelete = role === "super_admin";
  const doForceDelete = useServerFn(forceDeletePassbookEntry);
  const doDelete = useServerFn(deletePassbookEntry);
  const onDeleteEntry = async (entry: any) => {
    if (!confirm("Are you sure you want to delete this entry? This action cannot be undone.")) return;
    try {
      if (entry.source === "weekly") {
        await doForceDelete({ data: { id: entry.id } });
      } else {
        const reason = prompt("Reason for deletion (required, min 3 chars):") ?? "";
        if (reason.trim().length < 3) { toast.error("Reason required"); return; }
        await doDelete({ data: { id: entry.id, reason } });
      }
      toast.success("Entry deleted and balances recalculated");
      qc.invalidateQueries({ queryKey: ["passbook", memberId] });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete");
    }
  };

  return (
    <div>
      <PageHeader title="Passbook" subtitle="Member savings ledger — weekly entries sync automatically; use Manual Entry for bonuses, withdrawals, adjustments." actions={
        canEdit && memberId ? <Button onClick={() => setOpen(true)} className="bg-navy text-white hover:bg-navy-2">+ Manual Entry</Button> : undefined
      } />
      <Card className="p-4 mb-4">
        <Label className="text-xs uppercase tracking-wider">Select Member</Label>
        <Select value={memberId} onValueChange={setMemberId}>
          <SelectTrigger className="max-w-md mt-1"><SelectValue placeholder="Choose a member…" /></SelectTrigger>
          <SelectContent>
            {members.map((m: any) => (
              <SelectItem key={m.id} value={m.id}>{m.membership_no ?? "—"} · {m.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {memberId && (
        <PassbookTable entries={entries} loading={isLoading} memberName={selectedMember?.full_name} membershipNo={selectedMember?.membership_no ?? undefined} memberLoans={memberLoans} canEdit={canEdit} canDelete={canDelete} onEdit={setEditEntry} onDelete={onDeleteEntry} />
      )}

      <NewEntryDialog open={open} onOpenChange={setOpen} memberId={memberId} latestDate={entries.at(-1)?.entry_date} memberLoans={memberLoans} onCreated={() => qc.invalidateQueries({ queryKey: ["passbook", memberId] })} />
      <EditEntryDialog entry={editEntry} onClose={() => setEditEntry(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["passbook", memberId] })} />
    </div>
  );
}

function NewEntryDialog({ open, onOpenChange, memberId, latestDate, memberLoans = [], onCreated }: any) {
  const doCreate = useServerFn(createManualPassbookEntry);
  const nextDate = (base?: string) => {
    const d = base ? new Date(base) : new Date();
    if (base) d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  };
  const [category, setCategory] = useState<string>("bonus");
  const [form, setForm] = useState({
    entry_date: nextDate(latestDate),
    description: "Bonus Allocation",
    amount: "",
    savings: "", bonus: "", withdrawal: "", loan_payment: "",
    remarks: "", treasurer_sign: "",
    reason: "",
  });
  const [selectedLoanTarget, setSelectedLoanTarget] = useState("");
  useEffect(() => {
    if (open) {
      const cat = MANUAL_CATEGORIES.find((c) => c.value === category);
      setForm((f) => ({ ...f, entry_date: nextDate(latestDate), description: cat?.defaultDesc ?? "" }));
    }
  }, [open, latestDate]);

  useEffect(() => {
    if (!open) return;
    if (memberLoans.length === 1) {
      setSelectedLoanTarget(`${memberLoans[0].type}:${memberLoans[0].id}`);
      return;
    }
    setSelectedLoanTarget("");
  }, [open, memberId, memberLoans]);

  const onCategoryChange = (v: string) => {
    setCategory(v);
    const cat = MANUAL_CATEGORIES.find((c) => c.value === v);
    setForm((f) => ({ ...f, description: cat?.defaultDesc ?? "" }));
  };

  const [submitting, setSubmitting] = useState(false);

  const cat = MANUAL_CATEGORIES.find((c) => c.value === category);
  const singleField = cat?.field;
  const effectiveLoanPayment = singleField === "loan_payment" ? Number(form.amount || 0) : Number(form.loan_payment || 0);
  const needsLoanSelection = memberLoans.length > 1 && effectiveLoanPayment > 0;
  const selectedLoan = memberLoans.find((loan: MemberLoanOption) => `${loan.type}:${loan.id}` === selectedLoanTarget) ?? null;

  const submit = async () => {
    if (!form.description.trim()) { toast.error("Description is required"); return; }
    setSubmitting(true);
    try {
      let savings = Number(form.savings || 0);
      let bonus = Number(form.bonus || 0);
      let withdrawal = Number(form.withdrawal || 0);
      let loan_payment = Number(form.loan_payment || 0);

      if (singleField) {
        const amt = Number(form.amount || 0);
        savings = singleField === "savings" ? amt : 0;
        bonus = singleField === "bonus" ? amt : 0;
        withdrawal = singleField === "withdrawal" ? amt : 0;
        loan_payment = singleField === "loan_payment" ? amt : 0;
      }

      let entry_loan_id: string | null = null;
      let entry_opening_loan_id: string | null = null;
      const targetLoan = loan_payment > 0
        ? (memberLoans.length > 1 ? selectedLoan : memberLoans.length === 1 ? memberLoans[0] : null)
        : null;

      if (loan_payment > 0 && memberLoans.length > 1 && !targetLoan) {
        toast.error("Select which loan this payment is for");
        return;
      }

      if (targetLoan?.type === "loan") entry_loan_id = targetLoan.id;
      if (targetLoan?.type === "opening") entry_opening_loan_id = targetLoan.id;

      await doCreate({
        data: {
          member_id: memberId,
          entry_date: form.entry_date,
          category: category as any,
          description: form.description.trim(),
          savings, bonus, withdrawal, loan_payment,
          remarks: form.remarks || form.description,
          treasurer_sign: form.treasurer_sign || null,
          reason: (category === "adjustment" || category === "withdrawal") ? (form.reason || null) : null,
          entry_loan_id,
          entry_opening_loan_id,
        },
      });
      toast.success("Entry recorded");
      setForm({ entry_date: nextDate(form.entry_date), description: cat?.defaultDesc ?? "", amount: "", savings: "", bonus: "", withdrawal: "", loan_payment: "", remarks: "", treasurer_sign: "", reason: "" });
      setSelectedLoanTarget(memberLoans.length === 1 ? `${memberLoans[0].type}:${memberLoans[0].id}` : "");
      onOpenChange(false); onCreated();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create entry");
    } finally {
      setSubmitting(false);
    }
  };

  const requiresReason = category === "adjustment" || category === "withdrawal";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-serif">New Manual Passbook Entry</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={onCategoryChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MANUAL_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="col-span-2"><Label>Date</Label><Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></div>

          {singleField ? (
            <div className="col-span-2">
              <Label>Amount ({singleField.replace("_", " ")})</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          ) : (
            <>
              <div><Label>Savings</Label><Input type="number" step="0.01" value={form.savings} onChange={(e) => setForm({ ...form, savings: e.target.value })} /></div>
              <div><Label>Bonus</Label><Input type="number" step="0.01" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} /></div>
              <div><Label>Withdrawal</Label><Input type="number" step="0.01" value={form.withdrawal} onChange={(e) => setForm({ ...form, withdrawal: e.target.value })} /></div>
              <div><Label>Loan Payment</Label><Input type="number" step="0.01" value={form.loan_payment} onChange={(e) => setForm({ ...form, loan_payment: e.target.value })} /></div>
            </>
          )}

          {needsLoanSelection && (
            <div className="col-span-2">
              <Label>Which loan is this payment for? <span className="text-red-600">*</span></Label>
              <Select value={selectedLoanTarget} onValueChange={setSelectedLoanTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="Select loan" />
                </SelectTrigger>
                <SelectContent>
                  {memberLoans.map((loan: MemberLoanOption) => (
                    <SelectItem key={`${loan.type}-${loan.id}`} value={`${loan.type}:${loan.id}`}>
                      {loan.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="col-span-2"><Label>Remarks (optional)</Label><Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div>
          <div className="col-span-2"><Label>Treasurer Sign</Label><Input value={form.treasurer_sign} onChange={(e) => setForm({ ...form, treasurer_sign: e.target.value })} /></div>

          {requiresReason && (
            <div className="col-span-2">
              <Label>Reason {category === "adjustment" ? "(required)" : "(recommended)"}</Label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Why is this entry being recorded?" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-navy text-white hover:bg-navy-2">{submitting ? "Saving…" : "Save Entry"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditEntryDialog({ entry, onClose, onSaved }: any) {
  const doUpdate = useServerFn(updatePassbookEntry);
  const open = !!entry;

  const [form, setForm] = useState({
    entry_date: "",
    description: "",
    savings: "",
    bonus: "",
    withdrawal: "",
    loan_payment: "",
    remarks: "",
    treasurer_sign: "",
    reason: "",
  });

  useEffect(() => {
    if (entry) {
      setForm({
        entry_date: entry.entry_date ?? "",
        description: entry.description ?? entry.remarks ?? "",
        savings: String(entry.savings ?? ""),
        bonus: String(entry.bonus ?? ""),
        withdrawal: String(entry.withdrawal ?? ""),
        loan_payment: String(entry.loan_payment ?? ""),
        remarks: entry.remarks ?? "",
        treasurer_sign: entry.treasurer_sign ?? "",
        reason: "",
      });
    }
  }, [entry?.id]);

  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!entry) return;
    if (form.reason.trim().length < 3) {
      toast.error("Reason for change is required (min 3 chars)");
      return;
    }
    setSubmitting(true);
    try {
      await doUpdate({
        data: {
          id: entry.id,
          entry_date: form.entry_date,
          description: form.description || undefined,
          savings: Number(form.savings || 0),
          bonus: Number(form.bonus || 0),
          withdrawal: Number(form.withdrawal || 0),
          loan_payment: Number(form.loan_payment || 0),
          remarks: form.remarks || null,
          treasurer_sign: form.treasurer_sign || null,
          reason: form.reason.trim(),
        },
      });
      toast.success("Entry updated and balances recalculated");
      onClose();
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Update failed");
    } finally {
      setSubmitting(false);
    }
  };

  const isWeekly = entry?.source === "weekly";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-serif">Edit Passbook Entry</DialogTitle></DialogHeader>
        {isWeekly && (
          <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-md p-2 mb-2">
            This entry is auto-synced from a Weekly Collection Sheet. Edits here will be overwritten next time that sheet is saved — change the sheet itself for permanent edits.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="col-span-2"><Label>Date</Label><Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></div>
          <div><Label>Savings</Label><Input type="number" step="0.01" value={form.savings} onChange={(e) => setForm({ ...form, savings: e.target.value })} /></div>
          <div><Label>Bonus</Label><Input type="number" step="0.01" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} /></div>
          <div><Label>Withdrawal</Label><Input type="number" step="0.01" value={form.withdrawal} onChange={(e) => setForm({ ...form, withdrawal: e.target.value })} /></div>
          <div><Label>Loan Payment</Label><Input type="number" step="0.01" value={form.loan_payment} onChange={(e) => setForm({ ...form, loan_payment: e.target.value })} /></div>
          <div className="col-span-2"><Label>Remarks</Label><Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div>
          <div className="col-span-2"><Label>Treasurer Sign</Label><Input value={form.treasurer_sign} onChange={(e) => setForm({ ...form, treasurer_sign: e.target.value })} /></div>
          <div className="col-span-2">
            <Label>Reason for change <span className="text-red-600">*</span></Label>
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Corrected savings amount per member receipt" />
            <div className="text-[11px] text-muted-foreground mt-1">Required — this is recorded in the Audit Log.</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-navy text-white hover:bg-navy-2">{submitting ? "Saving…" : "Update Entry"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

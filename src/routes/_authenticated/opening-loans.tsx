import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtKES, fmtDate } from "@/lib/format";
import { calculateOutstandingBalanceFromData } from "@/lib/loan-balance";
import { LoanActions } from "@/components/LoanActions";

// Helper to safely calculate balance
const calculateBalance = (totalRepayable: string, amountPaid: string) => {
  const tr = Number(totalRepayable || 0);
  const ap = Number(amountPaid || 0);
  return Math.max(0, tr - ap).toString();
};

export const Route = createFileRoute("/_authenticated/opening-loans")({
  component: OpeningLoansPage,
  head: () => ({
    meta: [
      { title: "Opening Loan Balances — Elite Kahoya Brothers" },
      {
        name: "description",
        content:
          "Record per-loan brought-forward balances for loans that existed before the system started.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

type OpeningLoan = {
  id: string;
  member_id: string;
  loan_date: string;
  principal: number;
  interest_rate: number;
  total_repayable: number;
  amount_paid: number;
  balance: number;
  status?: string;
  notes: string | null;
  profile?: { full_name: string; membership_no: string | null };
};

const emptyForm = {
  id: "",
  member_id: "",
  loan_date: new Date().toISOString().slice(0, 10),
  principal: "0",
  interest_rate: "0",
  total_repayable: "0",
  amount_paid: "0",
  balance: "0",
  notes: "",
};

function OpeningLoansPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canEdit = role === "super_admin" || role === "admin";
  const canDelete = role === "super_admin";

  useEffect(() => {
    if (!loading && role && !canEdit) navigate({ to: "/dashboard" });
  }, [loading, role, canEdit, navigate]);

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // Auto-calculate balance whenever total_repayable or amount_paid changes
  useEffect(() => {
    const newBalance = calculateBalance(form.total_repayable, form.amount_paid);
    if (form.balance !== newBalance) {
      setForm(prev => ({ ...prev, balance: newBalance }));
    }
  }, [form.total_repayable, form.amount_paid]);

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["members-lite-for-opening-loans"],
    enabled: canEdit,
    queryFn: async () => {
      const { fetchNonMemberIds, filterMembersOnly } = await import("@/lib/member-queries");
      const [profilesRes, nonMembers] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, membership_no")
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("membership_no"),
        fetchNonMemberIds(),
      ]);
      return filterMembersOnly(profilesRes.data ?? [], nonMembers);
    },
  });

  const { data: rows = [], isLoading: loansLoading } = useQuery({
    queryKey: ["opening-loans", members],
    enabled: canEdit && members.length > 0,
    queryFn: async (): Promise<OpeningLoan[]> => {
      const [{ data, error }, { data: repayments }] = await Promise.all([
        (supabase as any)
          .from("loan_opening_balances")
          .select("*")
          .order("loan_date", { ascending: false }),
        (supabase as any).from("loan_repayments").select("opening_loan_id, amount"),
      ]);
      if (error) throw error;
      const repaymentsByOpeningLoan = new Map<string, any[]>();
      for (const r of repayments ?? []) {
        const row = r as any;
        if (!row.opening_loan_id) continue;
        const list = repaymentsByOpeningLoan.get(row.opening_loan_id) ?? [];
        list.push(row);
        repaymentsByOpeningLoan.set(row.opening_loan_id, list);
      }
      const profMap = new Map(
        (members as any[]).map((m) => [m.id, { full_name: m.full_name, membership_no: m.membership_no }]),
      );
      return (data ?? []).map((r: any) => {
        const loanRepayments = repaymentsByOpeningLoan.get(r.id) ?? [];
        const balance = calculateOutstandingBalanceFromData({ ...r, __opening: true }, loanRepayments);
        return {
          id: r.id,
          member_id: r.member_id,
          loan_date: r.loan_date,
          principal: Number(r.principal ?? 0),
          interest_rate: Number(r.interest_rate ?? 0),
          total_repayable: Number(r.total_repayable ?? 0),
          amount_paid: loanRepayments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
          balance,
          status: balance <= 0 ? "cleared" : (r.status ?? "active"),
          notes: r.notes,
          profile: profMap.get(r.member_id),
        };
      });
    },
  });
  
  const isLoading = membersLoading || loansLoading;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.profile?.full_name ?? "").toLowerCase().includes(q) ||
        (r.profile?.membership_no ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const openNew = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (r: OpeningLoan) => {
    setForm({
      id: r.id,
      member_id: r.member_id,
      loan_date: r.loan_date,
      principal: String(r.principal),
      interest_rate: String(r.interest_rate),
      total_repayable: String(r.total_repayable),
      amount_paid: String(r.amount_paid),
      balance: String(r.balance),
      notes: r.notes ?? "",
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    console.log("=== Opening Loan Submit ===");
    console.log("Form state:", form);
    if (!form.member_id) return toast.error("Member is required");
    const amountPaid = Number(form.amount_paid || 0);
    const totalRepayable = Number(form.total_repayable || 0);
    console.log("Parsed values:", { amountPaid, totalRepayable });
    
    try {
      let openingLoanId: string | null = null;
      
      if (form.id) {
        // Update existing opening loan
        openingLoanId = form.id;
        console.log("Updating existing opening loan with id:", openingLoanId);
        
        const { error } = await (supabase as any)
          .from("loan_opening_balances")
          .update({
            member_id: form.member_id,
            loan_date: form.loan_date,
            principal: Number(form.principal || 0),
            interest_rate: Number(form.interest_rate || 0),
            total_repayable: totalRepayable,
            notes: form.notes || null,
          })
          .eq("id", openingLoanId);
        if (error) throw error;

        // Update or create the opening balance repayment
        const { data: existingRepayments } = await (supabase as any)
          .from("loan_repayments")
          .select("*")
          .eq("opening_loan_id", openingLoanId)
          .eq("source", "opening_balance")
          .limit(1);
        
        console.log("Found existing opening_balance repayments:", existingRepayments);
        
        if (existingRepayments && existingRepayments.length > 0) {
          // Update existing opening balance repayment
          if (amountPaid > 0) {
            console.log("Updating existing repayment to amount:", amountPaid);
            await (supabase as any)
              .from("loan_repayments")
              .update({
                amount: amountPaid,
                payment_date: form.loan_date,
                principal_paid: amountPaid,
              })
              .eq("id", existingRepayments[0].id);
          } else {
            console.log("Deleting existing repayment (amountPaid is 0)");
            // Delete if amountPaid is 0
            await (supabase as any)
              .from("loan_repayments")
              .delete()
              .eq("id", existingRepayments[0].id);
          }
        } else if (amountPaid > 0) {
          console.log("Creating new repayment with amount:", amountPaid);
          // Create new opening balance repayment
          await (supabase as any)
            .from("loan_repayments")
            .insert({
              opening_loan_id: openingLoanId,
              amount: amountPaid,
              payment_date: form.loan_date,
              notes: "Opening balance brought forward",
              payment_method: "manual",
              source: "opening_balance",
              principal_paid: amountPaid,
              fine_paid: 0,
            });
        }
      } else {
        // Insert new opening loan
        console.log("Inserting new opening loan");
        const { data: insertedLoan, error: insertErr } = await (supabase as any)
          .from("loan_opening_balances")
          .insert({
            member_id: form.member_id,
            loan_date: form.loan_date,
            principal: Number(form.principal || 0),
            interest_rate: Number(form.interest_rate || 0),
            total_repayable: totalRepayable,
            notes: form.notes || null,
          })
          .select("*")
          .single();
        if (insertErr || !insertedLoan) throw insertErr;
        openingLoanId = insertedLoan.id;
        console.log("New opening loan created with id:", openingLoanId);

        // If user entered an amount_paid, create a corresponding loan_repayment entry
        if (amountPaid > 0) {
          console.log("Creating repayment for new loan with amount:", amountPaid);
          const { error: repErr } = await (supabase as any)
            .from("loan_repayments")
            .insert({
              opening_loan_id: openingLoanId,
              amount: amountPaid,
              payment_date: form.loan_date,
              notes: "Opening balance brought forward",
              payment_method: "manual",
              source: "opening_balance",
              principal_paid: amountPaid,
              fine_paid: 0,
            });
          if (repErr) throw repErr;
        }
      }
      
      // Always recalculate balance (for both new and updated loans)
      console.log("Calling recalculate_opening_loan_balance with id:", openingLoanId);
      await (supabase as any).rpc("recalculate_opening_loan_balance", { _opening_loan_id: openingLoanId });
      
      toast.success(form.id ? "Opening loan updated" : "Opening loan added");

      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["opening-loans"] });
      qc.invalidateQueries({ queryKey: ["loans-all"] });
      qc.invalidateQueries({ queryKey: ["my-loans"] });
    } catch (e: any) {
      console.error("Error submitting opening loan:", e);
      toast.error(e.message ?? "Failed");
    }
  };

  const del = async (r: OpeningLoan) => {
    if (!confirm(`Delete opening loan for ${r.profile?.full_name ?? "this member"}?`)) return;
    try {
      const { error } = await (supabase as any)
        .from("loan_opening_balances")
        .delete()
        .eq("id", r.id);
      if (error) throw error;
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["opening-loans"] });
      qc.invalidateQueries({ queryKey: ["loans-all"] });
      qc.invalidateQueries({ queryKey: ["my-loans"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  };

  if (loading || !role) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!canEdit) return null;

  return (
    <div>
      <PageHeader
        title="Opening Loan Balances"
        subtitle="Per-loan brought-forward records for loans taken before the system started"
        actions={
          <Button onClick={openNew} className="bg-navy text-white hover:bg-navy-2">
            + Add Opening Loan
          </Button>
        }
      />

      <Card className="p-4 mb-4">
        <Label className="text-xs uppercase tracking-wider">Search</Label>
        <Input
          className="max-w-md mt-1"
          placeholder="Name or membership number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Card>

      {/* Summary Table (Admin/Super Admin Only) */}
      <Card className="mb-4">
        <div className="p-4 border-b border-border font-serif text-lg">
          Opening Loan Balances Summary
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left">No</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2 text-right">Amount Paid</th>
                {filtered.length > 0 && (
                  <th className="px-3 py-2 text-right">
                    Loan Bal. As At {filtered.length > 0 ? fmtDate(filtered[0].loan_date) : ""}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={filtered.length > 0 ? 5 : 4} className="p-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    No opening loan records yet.
                  </td>
                </tr>
              )}
              {filtered.map((r, index) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono">{index + 1}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.profile?.full_name ?? r.member_id.slice(0, 8)}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(r.total_repayable)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(r.amount_paid)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-navy">{fmtKES(r.balance)}</td>
                </tr>
              ))}
              {filtered.length > 0 && (
                <tr className="bg-muted/40 font-semibold border-t-2 border-border">
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {fmtKES(filtered.reduce((sum, r) => sum + r.total_repayable, 0))}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {fmtKES(filtered.reduce((sum, r) => sum + r.amount_paid, 0))}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {fmtKES(filtered.reduce((sum, r) => sum + r.balance, 0))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Main Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left">Member</th>
                <th className="px-3 py-2 text-left">Loan Date</th>
                <th className="px-3 py-2 text-right">Principal</th>
                <th className="px-3 py-2 text-right">Interest %</th>
                <th className="px-3 py-2 text-right">Total Repayable</th>
                <th className="px-3 py-2 text-right">Amount Paid</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    No opening loan records yet.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <div className="font-medium text-navy">{r.profile?.full_name ?? r.member_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.profile?.membership_no ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.loan_date)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(r.principal)}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.interest_rate}%</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(r.total_repayable)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtKES(r.amount_paid)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-navy">{fmtKES(r.balance)}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.balance <= 0 ? "bg-emerald-100 text-emerald-700 font-bold" : "bg-amber-100 text-amber-800 font-semibold"}`}>
                      {r.balance <= 0 ? "CLEARED" : "OPENING B/F"}
                    </span>
                    {r.balance <= 0 && <div className="mt-1 text-[11px] text-emerald-700 font-semibold">Loan Fully Cleared</div>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <LoanActions
                      loan={{
                        ...r,
                        id: `opening-${r.id}`,
                        __opening: true,
                        amount_borrowed: r.total_repayable,
                        outstanding_fines: 0,
                      }}
                      role={role}
                    />
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)} className="text-blue-600 hover:text-blue-800">
                      Edit
                    </Button>
                    {canDelete && (
                      <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-800" onClick={() => del(r)}>
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {form.id ? "Edit Opening Loan" : "Add Opening Loan"}
            </DialogTitle>
            <DialogDescription>
              Record a loan that existed before the system started and is still being repaid.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Member</Label>
              <Select value={form.member_id} onValueChange={(v) => setForm({ ...form, member_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose member…" />
                </SelectTrigger>
                <SelectContent>
                  {(members as any[]).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.membership_no} · {m.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Loan Date</Label>
              <Input
                type="date"
                value={form.loan_date}
                onChange={(e) => setForm({ ...form, loan_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Principal (KSh)</Label>
              <Input type="number" min="0" step="0.01" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} />
            </div>
            <div>
              <Label>Interest Rate (%)</Label>
              <Input type="number" min="0" step="0.01" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} />
            </div>
            <div>
              <Label>Total Repayable (KSh)</Label>
              <Input type="number" min="0" step="0.01" value={form.total_repayable} onChange={(e) => setForm({ ...form, total_repayable: e.target.value })} />
            </div>
            <div>
              <Label>Amount Paid (KSh)</Label>
              <Input type="number" min="0" step="0.01" value={form.amount_paid} onChange={(e) => setForm({ ...form, amount_paid: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Balance (KSh)</Label>
              <Input 
                type="number" 
                min="0" 
                step="0.01" 
                value={form.balance} 
                readOnly 
                className="bg-muted cursor-not-allowed"
              />
            </div>
            <div className="col-span-2">
              <Label>Notes / Remarks</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} className="bg-navy text-white hover:bg-navy-2">
              {form.id ? "Save Changes" : "Add Opening Loan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

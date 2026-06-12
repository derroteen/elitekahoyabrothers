import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { addLoanPayment, deleteLoan } from "@/lib/loan.functions";
import { toast } from "sonner";
import { fmtKES } from "@/lib/format";
import type { AppRole } from "@/lib/auth-context";

interface Props {
  loan: any;
  role: AppRole | null;
}

export function LoanActions({ loan, role }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = role === "admin" || role === "super_admin";
  const isSuperAdmin = role === "super_admin";
  const [payOpen, setPayOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  const goLedger = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!loan?.id) { toast.error("Missing loan id"); return; }
    navigate({ to: "/loans/$loanId", params: { loanId: String(loan.id) } });
  };

  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button size="sm" type="button" className="bg-navy text-white hover:bg-navy-2" onClick={goLedger}>
        View Ledger
      </Button>
      {isAdmin && loan.status !== "rejected" && loan.status !== "pending" && (
        <Button size="sm" type="button" variant="outline"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPayOpen(true); }}>
          Record Payment
        </Button>
      )}
      {isSuperAdmin && (
        <Button size="sm" type="button" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDelOpen(true); }}>
          Delete
        </Button>
      )}
      <RecordPaymentDialog loan={loan} open={payOpen} onClose={() => setPayOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["loans-all"] })} />
      <DeleteLoanDialog loan={loan} open={delOpen} onClose={() => setDelOpen(false)} onDeleted={() => qc.invalidateQueries({ queryKey: ["loans-all"] })} />
    </div>
  );
}

function RecordPaymentDialog({ loan, open, onClose, onSaved }: any) {
  const doAdd = useServerFn(addLoanPayment);
  const [form, setForm] = useState({
    payment_date: new Date().toISOString().slice(0, 10),
    amount: "",
    payment_method: "cash",
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.amount || Number(form.amount) <= 0) { toast.error("Enter a valid amount"); return; }
    setBusy(true);
    try {
      await doAdd({ data: {
        loan_id: loan.id,
        amount: Number(form.amount),
        payment_date: form.payment_date,
        payment_method: form.payment_method,
        notes: form.notes || null,
      }});
      toast.success("Payment recorded");
      onClose();
      onSaved?.();
      setForm({ payment_date: new Date().toISOString().slice(0, 10), amount: "", payment_method: "cash", notes: "" });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to record payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">Record Loan Payment</DialogTitle>
          <DialogDescription>
            {loan?.profile?.full_name ?? ""} · Outstanding {fmtKES(loan?.balance ?? 0)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Payment Date</Label><Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} /></div>
          <div><Label>Amount (KES)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="col-span-2">
            <Label>Method</Label>
            <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="mpesa">M-Pesa</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Remarks</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-navy text-white hover:bg-navy-2">
            {busy ? "Saving…" : "Save Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteLoanDialog({ loan, open, onClose, onDeleted }: any) {
  const doDelete = useServerFn(deleteLoan);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) { toast.error("Deletion reason is required"); return; }
    setBusy(true);
    try {
      await doDelete({ data: { id: loan.id, reason: reason.trim() } });
      toast.success("Loan deleted");
      onClose();
      onDeleted?.();
      setReason("");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete loan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif text-red-700">Delete Loan</DialogTitle>
          <DialogDescription>
            Are you sure you want to permanently delete this loan for{" "}
            <span className="font-medium">{loan?.profile?.full_name ?? loan?.member_id}</span>?
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label>Deletion reason (required)</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this loan is being deleted (recorded in audit log)" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !reason.trim()} className="bg-red-600 text-white hover:bg-red-700">
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

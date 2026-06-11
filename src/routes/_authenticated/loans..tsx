
function ConfirmDeleteDialog({ title, message, onClose, onConfirm }: { title: string; message: string; onClose: () => void; onConfirm: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">{title}</DialogTitle></DialogHeader>
        <p className="text-sm">{message}</p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button className="bg-red-600 text-white hover:bg-red-700" disabled={busy}
            onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPaymentDialog({ loanId, payment, onClose, onSaved, actorId }: { loanId: string; payment: any; onClose: () => void; onSaved: () => void; actorId: string | null }) {
  const [form, setForm] = useState({
    payment_date: payment.date ?? new Date().toISOString().slice(0, 10),
    amount: String((payment.amount ?? 0) + (payment.penalty ?? 0)),
    penalty: String(payment.penalty ?? 0),
  });
  const submit = useMutation({
    mutationFn: async () => {
      const oldVal = { amount: payment.amount + payment.penalty, date: payment.date, penalty: payment.penalty };
      const newVal = { amount: Number(form.amount), date: form.payment_date, penalty: Number(form.penalty) };
      const { error } = await supabase.from("loan_repayments").update({
        amount: Number(form.amount),
        payment_date: form.payment_date,
        fine_paid: Number(form.penalty),
        principal_paid: Math.max(0, Number(form.amount) - Number(form.penalty)),
      } as any).eq("id", payment.id);
      if (error) throw error;
      const { error: e2 } = await (supabase as any).rpc("recalc_loan_from_payments", { _loan_id: loanId });
      if (e2) throw e2;
      await supabase.from("audit_logs").insert({
        actor_id: actorId, action: "edit_loan_payment", table_name: "loan_repayments",
        record_id: payment.id, old_value: oldVal as any, new_value: newVal as any,
        reason: "Payment edited from ledger",
      } as any);
    },
    onSuccess: () => { toast.success("Payment updated, balances recalculated"); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">Edit Payment</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Payment Date</Label><Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} /></div>
          <div><Label>Amount Paid</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="col-span-2"><Label>Penalty Amount (of which)</Label><Input type="number" step="0.01" value={form.penalty} onChange={(e) => setForm({ ...form, penalty: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button className="bg-navy text-white hover:bg-navy-2" disabled={submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditInsuranceDialog({ loanId, payment, onClose, onSaved, actorId }: { loanId: string; payment: any; onClose: () => void; onSaved: () => void; actorId: string | null }) {
  const [form, setForm] = useState({
    payment_date: payment.date ?? new Date().toISOString().slice(0, 10),
    amount: String(payment.amount ?? 0),
  });
  const submit = useMutation({
    mutationFn: async () => {
      const oldVal = { amount: payment.amount, date: payment.date };
      const newVal = { amount: Number(form.amount), date: form.payment_date };
      const { error } = await (supabase.from("loan_insurance_payments" as any) as any).update({
        amount: Number(form.amount),
        payment_date: form.payment_date,
      }).eq("id", payment.id);
      if (error) throw error;
      const { error: e2 } = await (supabase as any).rpc("recalc_insurance_from_payments", { _loan_id: loanId });
      if (e2) throw e2;
      await supabase.from("audit_logs").insert({
        actor_id: actorId, action: "edit_insurance_payment", table_name: "loan_insurance_payments",
        record_id: payment.id, old_value: oldVal as any, new_value: newVal as any,
        reason: "Insurance payment edited from ledger",
      } as any);
    },
    onSuccess: () => { toast.success("Insurance payment updated"); onSaved(); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">Edit Insurance Payment</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Payment Date</Label><Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} /></div>
          <div><Label>Amount</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button className="bg-navy text-white hover:bg-navy-2" disabled={submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

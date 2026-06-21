import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getRole(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  return data?.role as string | undefined;
}

async function assertLoanEditor(userId: string) {
  const role = await getRole(userId);
  if (role !== "super_admin" && role !== "admin") throw new Error("Permission denied: admin only");
}

async function assertSuperAdmin(userId: string) {
  if ((await getRole(userId)) !== "super_admin") throw new Error("Permission denied: super admin only");
}

async function writeLoanAudit(actorId: string, action: string, loanId: string, amount?: number, oldValue?: unknown, newValue?: unknown) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId,
    action,
    table_name: "loans",
    record_id: loanId,
    old_value: oldValue ?? null,
    new_value: { ...(typeof newValue === "object" && newValue ? newValue : {}), amount, loan_id: loanId },
  } as any);
}

function isOpeningLoanId(loanId: string) {
  return loanId.startsWith("opening-");
}

function normalizeLoanId(loanId: string) {
  return isOpeningLoanId(loanId) ? loanId.replace(/^opening-/, "") : loanId;
}

async function recalculateOpeningLoan(openingLoanId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any).rpc("recalculate_opening_loan_balance", {
    _opening_loan_id: openingLoanId,
  });
  if (error) throw new Error(error.message);
}

async function recalculateLoan(loanId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: loan, error: loanErr } = await supabaseAdmin.from("loans").select("*").eq("id", loanId).single();
  if (loanErr || !loan) throw new Error("Loan not found");

  await (supabaseAdmin.from("loan_fines" as any) as any).update({ amount_paid: 0, status: "unpaid" }).eq("loan_id", loanId);
  await (supabaseAdmin.from("loan_schedule" as any) as any).update({ amount_paid: 0, fine_paid: 0, payment_date: null, prepaid: false, status: "pending", remarks: null }).eq("loan_id", loanId);

  const { data: fines = [] } = await (supabaseAdmin.from("loan_fines" as any) as any).select("*").eq("loan_id", loanId).order("fine_date").order("created_at");
  const { data: schedule = [] } = await (supabaseAdmin.from("loan_schedule" as any) as any).select("*").eq("loan_id", loanId).order("period_number");
  const { data: payments = [] } = await supabaseAdmin.from("loan_repayments").select("*").eq("loan_id", loanId).order("payment_date").order("created_at");

  const finePaid = new Map<string, number>();
  const schedPaid = new Map<string, number>();
  const schedFinePaid = new Map<string, number>();
  const paymentBreakdown = new Map<string, { fine: number; principal: number }>();

  for (const payment of payments as any[]) {
    let remaining = Number(payment.amount || 0);
    let paidFine = 0;
    let paidPrincipal = 0;

    for (const fine of fines as any[]) {
      if (remaining <= 0) break;
      const already = finePaid.get(fine.id) ?? 0;
      const due = Number(fine.amount || 0) - already;
      if (due <= 0) continue;
      const pay = Math.min(remaining, due);
      finePaid.set(fine.id, already + pay);
      if (fine.schedule_id) schedFinePaid.set(fine.schedule_id, (schedFinePaid.get(fine.schedule_id) ?? 0) + pay);
      remaining -= pay;
      paidFine += pay;
    }

    for (const row of schedule as any[]) {
      if (remaining <= 0) break;
      const already = schedPaid.get(row.id) ?? 0;
      const due = Number(row.expected_amount || 0) - already;
      if (due <= 0) continue;
      const pay = Math.min(remaining, due);
      schedPaid.set(row.id, already + pay);
      remaining -= pay;
      paidPrincipal += pay;
    }

    paymentBreakdown.set(payment.id, { fine: paidFine, principal: paidPrincipal });
  }

  for (const fine of fines as any[]) {
    const paid = finePaid.get(fine.id) ?? 0;
    await (supabaseAdmin.from("loan_fines" as any) as any).update({ amount_paid: paid, status: paid >= Number(fine.amount || 0) ? "paid" : paid > 0 ? "partial" : "unpaid" }).eq("id", fine.id);
  }
  for (const row of schedule as any[]) {
    const paid = schedPaid.get(row.id) ?? 0;
    const fullyPaid = paid >= Number(row.expected_amount || 0);
    await (supabaseAdmin.from("loan_schedule" as any) as any).update({
      amount_paid: paid,
      fine_paid: schedFinePaid.get(row.id) ?? 0,
      status: fullyPaid ? "paid" : row.status === "overdue" ? "overdue" : "pending",
    }).eq("id", row.id);
  }
  for (const [id, breakdown] of paymentBreakdown) {
    await supabaseAdmin.from("loan_repayments").update({ fine_paid: breakdown.fine, principal_paid: breakdown.principal } as any).eq("id", id);
  }

  const totalFinePaid = [...paymentBreakdown.values()].reduce((sum, p) => sum + p.fine, 0);
  const totalPrincipalPaid = [...paymentBreakdown.values()].reduce((sum, p) => sum + p.principal, 0);
  const totalPaid = totalFinePaid + totalPrincipalPaid;
  const balance = Math.max(0, Number(loan.total_repayable || loan.balance || 0) - totalPrincipalPaid);
  const totalFines = Number(loan.total_fines_charged || 0);
  const outstandingFines = Math.max(0, totalFines - totalFinePaid);
  const status = balance <= 0 ? (outstandingFines > 0 ? "completed_with_fine" : "completed") : loan.status === "completed" || loan.status === "completed_with_fine" ? "active" : loan.status;

  await supabaseAdmin.from("loans").update({ amount_paid: totalPaid, balance, total_fines_paid: totalFinePaid, outstanding_fines: outstandingFines, status } as any).eq("id", loanId);
}

async function syncPassbookPayment(payment: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const openingLoanId = payment.opening_loan_id as string | null | undefined;
  const { data: loan } = openingLoanId
    ? await (supabaseAdmin as any)
        .from("loan_opening_balances")
        .select("member_id")
        .eq("id", openingLoanId)
        .single()
    : await supabaseAdmin.from("loans").select("member_id").eq("id", payment.loan_id).single();
  if (!loan) return;
  const marker = `${openingLoanId ? "Opening loan repayment" : "Loan repayment"} ID: ${payment.id}`;
  const row = {
    member_id: loan.member_id,
    entry_date: payment.payment_date,
    savings: 0,
    bonus: 0,
    withdrawal: 0,
    loan_payment: Number(payment.amount || 0),
    total: 0,
    balance: 0,
    loan_balance: 0,
    remarks: `${marker}${payment.notes ? ` | ${payment.notes}` : ""}`,
    created_by: payment.created_by ?? null,
    source: "manual",
    category: "loan_payment",
    description: openingLoanId ? "Opening Loan Repayment" : "Loan Repayment",
  };
  const { data: existing } = await supabaseAdmin.from("passbook_entries").select("id").eq("member_id", loan.member_id).ilike("remarks", `${marker}%`).maybeSingle();
  if (existing) await supabaseAdmin.from("passbook_entries").update(row as any).eq("id", existing.id);
  else await supabaseAdmin.from("passbook_entries").insert(row as any);
  await supabaseAdmin.rpc("recompute_passbook_balances", { _member: loan.member_id } as any);
}

async function deletePassbookPayment(payment: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const openingLoanId = payment.opening_loan_id as string | null | undefined;
  const { data: loan } = openingLoanId
    ? await (supabaseAdmin as any)
        .from("loan_opening_balances")
        .select("member_id")
        .eq("id", openingLoanId)
        .single()
    : await supabaseAdmin.from("loans").select("member_id").eq("id", payment.loan_id).single();
  if (!loan) return;
  const marker = openingLoanId ? "Opening loan repayment" : "Loan repayment";
  await supabaseAdmin.from("passbook_entries").delete().eq("member_id", loan.member_id).ilike("remarks", `${marker} ID: ${payment.id}%`);
  await supabaseAdmin.rpc("recompute_passbook_balances", { _member: loan.member_id } as any);
}

const PaymentInput = z.object({
  loan_id: z.string().refine((val) => {
    if (val.startsWith("opening-")) {
      const uuidPart = val.slice(8);
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuidPart);
    }
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  }, "Invalid loan ID"),
  amount: z.number().nonnegative(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_method: z.string().optional().nullable(),
  reference: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const addLoanPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PaymentInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertLoanEditor(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const normalizedLoanId = normalizeLoanId(data.loan_id);
    if (isOpeningLoanId(data.loan_id)) {
      const notes = [data.reference ? `Reference: ${data.reference}` : null, data.notes || null].filter(Boolean).join(" | ") || null;
      const { data: payment, error } = await supabaseAdmin
        .from("loan_repayments")
        .insert({
          loan_id: null,
          opening_loan_id: normalizedLoanId,
          amount: data.amount,
          payment_date: data.payment_date,
          notes,
          payment_method: data.payment_method ?? null,
          principal_paid: data.amount,
          fine_paid: 0,
          source: "manual",
          created_by: context.userId,
        } as any)
        .select("*")
        .single();
      if (error || !payment) throw new Error(error?.message ?? "Failed to record payment");
      await recalculateOpeningLoan(normalizedLoanId);
      await writeLoanAudit(context.userId, "Opening Loan Payment Added", data.loan_id, data.amount, null, data);
      return { ok: true, opening: true };
    }
    const notes = [data.reference ? `Reference: ${data.reference}` : null, data.notes || null].filter(Boolean).join(" | ") || null;
    const { data: result, error } = await (context.supabase as any).rpc("record_loan_repayment", {
      _loan_id: data.loan_id,
      _amount: data.amount,
      _payment_date: data.payment_date,
      _notes: notes,
      _payment_method: data.payment_method ?? null,
      _source: "manual",
      _weekly_entry_id: null,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("loan_repayments").select("*").eq("loan_id", data.loan_id).eq("amount", data.amount).eq("payment_date", data.payment_date).order("created_at", { ascending: false }).limit(1).maybeSingle();
    await writeLoanAudit(context.userId, "Payment Added", data.loan_id, data.amount, null, data);
    return result;
  });

export const editLoanPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PaymentInput.extend({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertLoanEditor(context.userId);
    const normalizedLoanId = normalizeLoanId(data.loan_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin.from("loan_repayments").select("*").eq("id", data.id).single();
    if (!before) throw new Error("Payment not found");
    const notes = [data.reference ? `Reference: ${data.reference}` : null, data.notes || null].filter(Boolean).join(" | ") || null;
    const { error } = await supabaseAdmin.from("loan_repayments").update({ amount: data.amount, payment_date: data.payment_date, payment_method: data.payment_method ?? null, notes } as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    if (isOpeningLoanId(data.loan_id) || (before as any).opening_loan_id) await recalculateOpeningLoan(normalizedLoanId);
    else await recalculateLoan(data.loan_id);
    await writeLoanAudit(context.userId, isOpeningLoanId(data.loan_id) ? "Opening Loan Payment Edited" : "Payment Edited", data.loan_id, data.amount, before, data);
    return { ok: true };
  });

export const deleteLoanPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ 
    id: z.string().uuid(), 
    loan_id: z.string().refine((val) => {
      if (val.startsWith("opening-")) {
        const uuidPart = val.slice(8);
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuidPart);
      }
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    }, "Invalid loan ID")
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertLoanEditor(context.userId);
    const normalizedLoanId = normalizeLoanId(data.loan_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    console.log("deleteLoanPayment called with data.id =", data.id);
    const { data: before, error: fetchError } = await supabaseAdmin.from("loan_repayments").select("*").eq("id", data.id).maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!before) throw new Error("Payment not found");
    const isOpening = isOpeningLoanId(data.loan_id) || (before as any).opening_loan_id;
    if (!isOpening) {
      const { data: loan, error: loanErr } = await supabaseAdmin.from("loans").select("status").eq("id", data.loan_id).maybeSingle();
      if (loanErr) throw new Error(loanErr.message);
      const status = (loan as any)?.status;
      if (status === "completed" || status === "completed_with_fine" || status === "closed" || status === "rejected") {
        throw new Error(`Cannot delete payment: loan is ${status}. Reopen the loan first if a correction is needed.`);
      }
    }
    const { error: deleteErr } = await supabaseAdmin.from("loan_repayments").delete().eq("id", data.id);
    if (deleteErr) throw new Error(deleteErr.message);
    if (isOpening) {
      const openingLoanId = (before as any).opening_loan_id || normalizedLoanId;
      await recalculateOpeningLoan(openingLoanId);
    } else {
      await recalculateLoan(data.loan_id);
    }
    await writeLoanAudit(context.userId, isOpening ? "Opening Loan Payment Deleted" : "Payment Deleted", data.loan_id, Number(before.amount || 0), before, null);
    return { ok: true };
  });

export const deleteLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().min(1), reason: z.string().min(1).max(500) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (isOpeningLoanId(data.id)) {
      const openingLoanId = normalizeLoanId(data.id);
      const { data: before } = await (supabaseAdmin as any)
        .from("loan_opening_balances")
        .select("*")
        .eq("id", openingLoanId)
        .single();
      if (!before) throw new Error("Opening loan not found");
      const { data: payments = [] } = await supabaseAdmin
        .from("loan_repayments")
        .select("*")
        .eq("opening_loan_id" as any, openingLoanId);
      for (const payment of payments as any[]) await deletePassbookPayment(payment);
      await supabaseAdmin.from("loan_repayments").delete().eq("opening_loan_id" as any, openingLoanId);
      const { error } = await (supabaseAdmin as any)
        .from("loan_opening_balances")
        .delete()
        .eq("id", openingLoanId);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: context.userId,
        action: "Opening Loan Deleted",
        table_name: "loan_opening_balances",
        record_id: openingLoanId,
        old_value: before as any,
        new_value: { reason: data.reason, member_id: (before as any).member_id } as any,
        reason: data.reason,
      } as any);
      return { ok: true };
    }
    const { data: before } = await supabaseAdmin.from("loans").select("*").eq("id", data.id).single();
    if (!before) throw new Error("Loan not found");
    const { data: payments = [] } = await supabaseAdmin.from("loan_repayments").select("*").eq("loan_id", data.id);
    for (const payment of payments as any[]) await deletePassbookPayment(payment);
    await (supabaseAdmin.from("loan_fines" as any) as any).delete().eq("loan_id", data.id);
    await (supabaseAdmin.from("loan_schedule" as any) as any).delete().eq("loan_id", data.id);
    await supabaseAdmin.from("loan_repayments").delete().eq("loan_id", data.id);
    await (supabaseAdmin.from("loan_insurance" as any) as any).delete().eq("loan_id", data.id);
    const { error } = await supabaseAdmin.from("loans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "Loan Deleted",
      table_name: "loans",
      record_id: data.id,
      old_value: before as any,
      new_value: { reason: data.reason, member_id: (before as any).member_id, amount_borrowed: (before as any).amount_borrowed } as any,
      reason: data.reason,
    } as any);
    return { ok: true };
  });

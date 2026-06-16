import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getRole(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  return data?.role as string | undefined;
}

async function assertAdmin(userId: string) {
  const r = await getRole(userId);
  if (r !== "super_admin" && r !== "admin") throw new Error("Permission denied: admin only");
}
async function assertSuperAdmin(userId: string) {
  if ((await getRole(userId)) !== "super_admin") throw new Error("Permission denied: super admin only");
}

async function audit(opts: {
  actorId: string;
  action: string;
  tableName: string;
  recordId: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: opts.actorId,
    action: opts.action,
    table_name: opts.tableName,
    record_id: opts.recordId,
    old_value: (opts.oldValue as any) ?? null,
    new_value: (opts.newValue as any) ?? null,
    reason: opts.reason ?? null,
  } as any);
}

const Id = z.object({ id: z.string().uuid() });

// ===== Generic delete helpers per table =====

// SAVINGS
export const deleteSavingsEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Id.parse(i))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin.from("savings_entries").select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("Entry not found");
    const { error } = await supabaseAdmin.from("savings_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.rpc("recompute_savings_balances", { _member: (before as any).member_id } as any);
    await audit({ actorId: context.userId, action: "deleted", tableName: "savings_entries", recordId: data.id, oldValue: before });
    return { ok: true };
  });

// BENEVOLENT
export const deleteBenevolentEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Id.parse(i))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin.from("benevolent_entries").select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("Entry not found");
    const { error } = await supabaseAdmin.from("benevolent_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.rpc("recompute_benevolent_balances", { _member: (before as any).member_id } as any);
    await audit({ actorId: context.userId, action: "deleted", tableName: "benevolent_entries", recordId: data.id, oldValue: before });
    return { ok: true };
  });

// PASSBOOK (force delete, regardless of source)
export const forceDeletePassbookEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Id.parse(i))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin.from("passbook_entries").select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("Entry not found");
    const { error } = await supabaseAdmin.from("passbook_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.rpc("recompute_passbook_balances", { _member: (before as any).member_id } as any);
    await audit({ actorId: context.userId, action: "deleted", tableName: "passbook_entries", recordId: data.id, oldValue: before });
    return { ok: true };
  });

// WEEKLY COLLECTION ENTRIES (single member row in a sheet)
export const deleteWeeklyCollectionEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Id.parse(i))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await (supabaseAdmin.from("weekly_collection_entries" as any) as any).select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("Entry not found");
    const { error } = await (supabaseAdmin.from("weekly_collection_entries" as any) as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    // triggers fan out to passbook / benevolent / loan repayments
    await audit({ actorId: context.userId, action: "deleted", tableName: "weekly_collection_entries", recordId: data.id, oldValue: before });
    return { ok: true };
  });

// OPENING BALANCES (reset to zero / remove row)
export const deleteOpeningBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ member_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin.from("member_opening_balances").select("*").eq("member_id", data.member_id).maybeSingle();
    if (!before) return { ok: true };
    const { error } = await supabaseAdmin.from("member_opening_balances").delete().eq("member_id", data.member_id);
    if (error) throw new Error(error.message);
    // trigger opening_balance_after_change recomputes all balances
    await audit({ actorId: context.userId, action: "deleted", tableName: "member_opening_balances", recordId: (before as any).id, oldValue: before });
    return { ok: true };
  });

// WEEKLY EXPENDITURES
export const deleteWeeklyExpenditure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Id.parse(i))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin.from("weekly_expenditures").select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("Entry not found");
    const { error } = await supabaseAdmin.from("weekly_expenditures").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit({ actorId: context.userId, action: "deleted", tableName: "weekly_expenditures", recordId: data.id, oldValue: before });
    return { ok: true };
  });

// ATTENDANCE
export const deleteAttendanceEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Id.parse(i))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin.from("attendance_entries").select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("Entry not found");
    const { error } = await supabaseAdmin.from("attendance_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit({ actorId: context.userId, action: "deleted", tableName: "attendance_entries", recordId: data.id, oldValue: before });
    return { ok: true };
  });

// LOAN FINES
const FineEdit = z.object({
  id: z.string().uuid(),
  amount: z.number().nonnegative(),
  reason: z.string().max(500).nullable().optional(),
  status: z.enum(["unpaid", "partial", "paid", "waived"]).optional(),
});
export const editLoanFine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FineEdit.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await (supabaseAdmin.from("loan_fines" as any) as any).select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("Fine not found");
    const patch: any = { amount: data.amount };
    if (data.reason !== undefined) patch.reason = data.reason;
    if (data.status) patch.status = data.status;
    const { error } = await (supabaseAdmin.from("loan_fines" as any) as any).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit({ actorId: context.userId, action: "edited", tableName: "loan_fines", recordId: data.id, oldValue: before, newValue: { ...before, ...patch } });
    return { ok: true };
  });

export const deleteLoanFine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Id.parse(i))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await (supabaseAdmin.from("loan_fines" as any) as any).select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("Fine not found");
    await deletePassbookFine(before);
    const { error } = await (supabaseAdmin.from("loan_fines" as any) as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    // Reduce loan totals
    const amt = Number((before as any).amount || 0);
    const paid = Number((before as any).amount_paid || 0);
    const { data: loan } = await supabaseAdmin.from("loans").select("*").eq("id", (before as any).loan_id).single();
    if (loan) {
      await supabaseAdmin.from("loans").update({
        total_fines_charged: Math.max(0, Number((loan as any).total_fines_charged || 0) - amt),
        total_fines_paid: Math.max(0, Number((loan as any).total_fines_paid || 0) - paid),
        outstanding_fines: Math.max(0, Number((loan as any).outstanding_fines || 0) - (amt - paid)),
      } as any).eq("id", (loan as any).id);
    }
    if ((before as any).schedule_id) {
      await (supabaseAdmin.from("loan_schedule" as any) as any).update({ fine_amount: 0, fine_paid: 0 }).eq("id", (before as any).schedule_id);
    }
    await audit({ actorId: context.userId, action: "deleted", tableName: "loan_fines", recordId: data.id, oldValue: before });
    return { ok: true };
  });

// LOAN INSURANCE PAYMENTS
const InsEdit = z.object({
  id: z.string().uuid(),
  amount: z.number().positive(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2000).nullable().optional(),
});
export const editInsurancePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InsEdit.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await (supabaseAdmin.from("loan_insurance_payments" as any) as any).select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("Payment not found");
    const { error } = await (supabaseAdmin.from("loan_insurance_payments" as any) as any).update({
      amount: data.amount, payment_date: data.payment_date, notes: data.notes ?? null,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.rpc("recalc_insurance_from_payments", { _loan_id: (before as any).loan_id } as any);
    await syncInsuranceById(data.id);
    await audit({ actorId: context.userId, action: "edited", tableName: "loan_insurance_payments", recordId: data.id, oldValue: before, newValue: data });
    return { ok: true };
  });

export const deleteInsurancePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Id.parse(i))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await (supabaseAdmin.from("loan_insurance_payments" as any) as any).select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("Payment not found");
    await deletePassbookInsurance(before);
    const { error } = await (supabaseAdmin.from("loan_insurance_payments" as any) as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.rpc("recalc_insurance_from_payments", { _loan_id: (before as any).loan_id } as any);
    await audit({ actorId: context.userId, action: "deleted", tableName: "loan_insurance_payments", recordId: data.id, oldValue: before });
    return { ok: true };
  });

// LOAN SCHEDULE
const SchedEdit = z.object({
  id: z.string().uuid(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expected_amount: z.number().nonnegative(),
  remarks: z.string().max(500).nullable().optional(),
});
export const editLoanSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SchedEdit.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await (supabaseAdmin.from("loan_schedule" as any) as any).select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("Schedule row not found");
    const { error } = await (supabaseAdmin.from("loan_schedule" as any) as any).update({
      due_date: data.due_date, expected_amount: data.expected_amount, remarks: data.remarks ?? null,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit({ actorId: context.userId, action: "edited", tableName: "loan_schedule", recordId: data.id, oldValue: before, newValue: data });
    return { ok: true };
  });

export const deleteLoanScheduleRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Id.parse(i))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await (supabaseAdmin.from("loan_schedule" as any) as any).select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("Schedule row not found");
    const { error } = await (supabaseAdmin.from("loan_schedule" as any) as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit({ actorId: context.userId, action: "deleted", tableName: "loan_schedule", recordId: data.id, oldValue: before });
    return { ok: true };
  });

// ===== Passbook sync helpers (separate categories: insurance_payment, fine_payment) =====

async function syncPassbookInsurance(payment: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: loan } = await supabaseAdmin.from("loans").select("member_id").eq("id", payment.loan_id).single();
  if (!loan) return;
  const marker = `Insurance payment ID: ${payment.id}`;
  const row = {
    member_id: (loan as any).member_id,
    entry_date: payment.payment_date,
    savings: 0, bonus: 0, withdrawal: 0, loan_payment: 0,
    total: 0, balance: 0, loan_balance: 0,
    remarks: `${marker}${payment.notes ? ` | ${payment.notes}` : ""}`,
    description: "Insurance Payment",
    category: "insurance_payment",
    source: "manual",
    created_by: payment.created_by ?? null,
  };
  const { data: existing } = await supabaseAdmin.from("passbook_entries").select("id").eq("member_id", (loan as any).member_id).ilike("remarks", `${marker}%`).maybeSingle();
  if (existing) await supabaseAdmin.from("passbook_entries").update(row as any).eq("id", (existing as any).id);
  else await supabaseAdmin.from("passbook_entries").insert(row as any);
  await supabaseAdmin.rpc("recompute_passbook_balances", { _member: (loan as any).member_id } as any);
}

async function deletePassbookInsurance(payment: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: loan } = await supabaseAdmin.from("loans").select("member_id").eq("id", payment.loan_id).single();
  if (!loan) return;
  await supabaseAdmin.from("passbook_entries").delete().eq("member_id", (loan as any).member_id).ilike("remarks", `Insurance payment ID: ${payment.id}%`);
  await supabaseAdmin.rpc("recompute_passbook_balances", { _member: (loan as any).member_id } as any);
}

async function syncPassbookFine(fine: any, paymentDate: string, notes: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: loan } = await supabaseAdmin.from("loans").select("member_id").eq("id", fine.loan_id).single();
  if (!loan) return;
  const marker = `Fine payment ID: ${fine.id}`;
  const paid = Number(fine.amount_paid ?? 0);
  if (paid <= 0) {
    await supabaseAdmin.from("passbook_entries").delete().eq("member_id", (loan as any).member_id).ilike("remarks", `${marker}%`);
    await supabaseAdmin.rpc("recompute_passbook_balances", { _member: (loan as any).member_id } as any);
    return;
  }
  const row = {
    member_id: (loan as any).member_id,
    entry_date: paymentDate,
    savings: 0, bonus: 0, withdrawal: paid, loan_payment: 0,
    total: 0, balance: 0, loan_balance: 0,
    remarks: `${marker}${notes ? ` | ${notes}` : ""}`,
    description: "Fine Payment",
    category: "fine_payment",
    source: "manual",
  };
  const { data: existing } = await supabaseAdmin.from("passbook_entries").select("id").eq("member_id", (loan as any).member_id).ilike("remarks", `${marker}%`).maybeSingle();
  if (existing) await supabaseAdmin.from("passbook_entries").update(row as any).eq("id", (existing as any).id);
  else await supabaseAdmin.from("passbook_entries").insert(row as any);
  await supabaseAdmin.rpc("recompute_passbook_balances", { _member: (loan as any).member_id } as any);
}

async function deletePassbookFine(fine: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: loan } = await supabaseAdmin.from("loans").select("member_id").eq("id", fine.loan_id).single();
  if (!loan) return;
  await supabaseAdmin.from("passbook_entries").delete().eq("member_id", (loan as any).member_id).ilike("remarks", `Fine payment ID: ${fine.id}%`);
  await supabaseAdmin.rpc("recompute_passbook_balances", { _member: (loan as any).member_id } as any);
}

// ===== Add Insurance Payment (with passbook sync) =====
const InsAdd = z.object({
  loan_id: z.string().uuid(),
  amount: z.number().positive(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2000).nullable().optional(),
});
export const addInsurancePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InsAdd.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await (context.supabase as any).rpc("record_insurance_payment", {
      _loan_id: data.loan_id, _amount: data.amount, _payment_date: data.payment_date, _notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment } = await (supabaseAdmin.from("loan_insurance_payments" as any) as any)
      .select("*").eq("loan_id", data.loan_id).eq("amount", data.amount).eq("payment_date", data.payment_date)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (payment) await syncPassbookInsurance(payment);
    await audit({ actorId: context.userId, action: "added", tableName: "loan_insurance_payments", recordId: (payment as any)?.id ?? data.loan_id, newValue: data });
    return { ok: true };
  });

// Patch the existing edit/delete to also sync passbook
async function syncInsuranceById(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: payment } = await (supabaseAdmin.from("loan_insurance_payments" as any) as any).select("*").eq("id", id).maybeSingle();
  if (payment) await syncPassbookInsurance(payment);
}

// ===== Add Loan Fine (manual) =====
const FineAdd = z.object({
  loan_id: z.string().uuid(),
  amount: z.number().positive(),
  fine_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(1).max(500),
});
export const addLoanFine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FineAdd.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin.from("loan_fines" as any) as any).insert({
      loan_id: data.loan_id, amount: data.amount, fine_date: data.fine_date,
      reason: data.reason, status: "unpaid", amount_paid: 0,
    }).select("id").single();
    if (error) throw new Error(error.message);
    const { data: loan } = await supabaseAdmin.from("loans").select("total_fines_charged, outstanding_fines").eq("id", data.loan_id).single();
    if (loan) {
      await supabaseAdmin.from("loans").update({
        total_fines_charged: Number((loan as any).total_fines_charged ?? 0) + data.amount,
        outstanding_fines: Number((loan as any).outstanding_fines ?? 0) + data.amount,
      } as any).eq("id", data.loan_id);
    }
    await audit({ actorId: context.userId, action: "added", tableName: "loan_fines", recordId: (row as any).id, newValue: data });
    return { ok: true, id: (row as any).id };
  });

// ===== Record Fine Payment (with passbook sync) =====
const FinePayInput = z.object({
  fine_id: z.string().uuid(),
  amount: z.number().positive(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2000).nullable().optional(),
});
export const recordFinePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FinePayInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: fine } = await (supabaseAdmin.from("loan_fines" as any) as any).select("*").eq("id", data.fine_id).maybeSingle();
    if (!fine) throw new Error("Fine not found");
    const newPaid = Number((fine as any).amount_paid ?? 0) + data.amount;
    const fineAmount = Number((fine as any).amount ?? 0);
    if (newPaid > fineAmount) throw new Error("Payment exceeds outstanding fine amount");
    const status = newPaid >= fineAmount ? "paid" : "partial";
    const noteSuffix = data.notes ? ` | ${data.notes}` : "";
    const reason = `${(fine as any).reason ?? ""} [Paid ${data.payment_date}${noteSuffix}]`.trim();
    await (supabaseAdmin.from("loan_fines" as any) as any).update({ amount_paid: newPaid, status, reason }).eq("id", data.fine_id);
    if ((fine as any).schedule_id) {
      await (supabaseAdmin.from("loan_schedule" as any) as any).update({ fine_paid: newPaid }).eq("id", (fine as any).schedule_id);
    }
    const { data: allFines } = await (supabaseAdmin.from("loan_fines" as any) as any).select("amount, amount_paid").eq("loan_id", (fine as any).loan_id);
    const totalCharged = (allFines ?? []).reduce((s: number, f: any) => s + Number(f.amount ?? 0), 0);
    const totalPaid = (allFines ?? []).reduce((s: number, f: any) => s + Number(f.amount_paid ?? 0), 0);
    await supabaseAdmin.from("loans").update({
      total_fines_paid: totalPaid,
      outstanding_fines: Math.max(0, totalCharged - totalPaid),
    } as any).eq("id", (fine as any).loan_id);
    const { data: updated } = await (supabaseAdmin.from("loan_fines" as any) as any).select("*").eq("id", data.fine_id).maybeSingle();
    if (updated) await syncPassbookFine(updated, data.payment_date, data.notes ?? null);
    await audit({ actorId: context.userId, action: "fine_payment", tableName: "loan_fines", recordId: data.fine_id, newValue: data });
    return { ok: true };
  });

// ===== Remove Applied Fines (bulk, super admin) =====
export const removeAppliedFines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ loan_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: fines = [] } = await (supabaseAdmin.from("loan_fines" as any) as any).select("*").eq("loan_id", data.loan_id);
    for (const f of fines as any[]) await deletePassbookFine(f);
    const { error } = await (supabaseAdmin.from("loan_fines" as any) as any).delete().eq("loan_id", data.loan_id);
    if (error) throw new Error(error.message);
    await (supabaseAdmin.from("loan_schedule" as any) as any).update({ fine_amount: 0, fine_paid: 0 }).eq("loan_id", data.loan_id);
    await supabaseAdmin.from("loans").update({ total_fines_charged: 0, total_fines_paid: 0, outstanding_fines: 0 } as any).eq("id", data.loan_id);
    await audit({ actorId: context.userId, action: "bulk_remove_fines", tableName: "loan_fines", recordId: data.loan_id, oldValue: { count: (fines as any[]).length } });
    return { ok: true, removed: (fines as any[]).length };
  });

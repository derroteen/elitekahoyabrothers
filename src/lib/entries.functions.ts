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

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MANUAL_CATEGORIES = [
  "bonus",
  "withdrawal",
  "brought_forward",
  "adjustment",
  "refund",
  "special_contribution",
  "dividend",
  "savings",
  "other",
] as const;

async function assertStaff(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  const role = data?.role;
  if (role !== "super_admin" && role !== "admin") {
    throw new Error("Permission denied: staff only");
  }
}

async function writeAudit(opts: {
  actorId: string;
  action: string;
  recordId: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: opts.actorId,
    action: opts.action,
    table_name: "passbook_entries",
    record_id: opts.recordId,
    old_value: opts.oldValue ?? null,
    new_value: opts.newValue ?? null,
    reason: opts.reason ?? null,
  } as any);
}

const CreateInput = z.object({
  member_id: z.string().uuid(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(MANUAL_CATEGORIES),
  description: z.string().min(1).max(200),
  savings: z.number().min(0).default(0),
  bonus: z.number().min(0).default(0),
  withdrawal: z.number().min(0).default(0),
  loan_payment: z.number().min(0).default(0),
  remarks: z.string().max(2000).nullable().optional(),
  treasurer_sign: z.string().max(200).nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
});

export const createManualPassbookEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("passbook_entries")
      .insert({
        member_id: data.member_id,
        entry_date: data.entry_date,
        category: data.category,
        description: data.description,
        source: "manual",
        savings: data.savings,
        bonus: data.bonus,
        withdrawal: data.withdrawal,
        loan_payment: data.loan_payment,
        total: 0,
        balance: 0,
        loan_balance: 0,
        remarks: data.remarks ?? data.description,
        treasurer_sign: data.treasurer_sign ?? null,
        reason: data.reason ?? null,
        created_by: context.userId,
      } as any)
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Insert failed");

    await supabaseAdmin.rpc("recompute_passbook_balances", { _member: data.member_id } as any);

    await writeAudit({
      actorId: context.userId,
      action: "MANUAL_CREATE",
      recordId: row.id,
      newValue: data,
      reason: data.reason ?? null,
    });

    return { ok: true, id: row.id };
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(MANUAL_CATEGORIES).optional(),
  description: z.string().min(1).max(200).optional(),
  savings: z.number().min(0),
  bonus: z.number().min(0),
  withdrawal: z.number().min(0),
  loan_payment: z.number().min(0),
  remarks: z.string().max(2000).nullable().optional(),
  treasurer_sign: z.string().max(200).nullable().optional(),
  reason: z.string().min(3, "Reason is required for edits").max(500),
});

export const updatePassbookEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: before, error: beforeErr } = await supabaseAdmin
      .from("passbook_entries")
      .select("*")
      .eq("id", data.id)
      .single();
    if (beforeErr || !before) throw new Error("Entry not found");

    const patch: Record<string, unknown> = {
      entry_date: data.entry_date,
      savings: data.savings,
      bonus: data.bonus,
      withdrawal: data.withdrawal,
      loan_payment: data.loan_payment,
      remarks: data.remarks ?? null,
      treasurer_sign: data.treasurer_sign ?? null,
      reason: data.reason,
    };
    if (data.category) patch.category = data.category;
    if (data.description) patch.description = data.description;

    const { error: editErr } = await supabaseAdmin
      .from("passbook_entries")
      .update(patch as any)
      .eq("id", data.id);
    if (editErr) throw new Error(editErr.message);

    await supabaseAdmin.rpc("recompute_passbook_balances", { _member: before.member_id } as any);

    await writeAudit({
      actorId: context.userId,
      action: "MANUAL_EDIT",
      recordId: data.id,
      oldValue: before,
      newValue: { ...before, ...patch },
      reason: data.reason,
    });

    return { ok: true };
  });

const DeleteInput = z.object({
  id: z.string().uuid(),
  reason: z.string().min(3, "Reason is required for deletion").max(500),
});

export const deletePassbookEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DeleteInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: before } = await supabaseAdmin
      .from("passbook_entries")
      .select("*")
      .eq("id", data.id)
      .single();
    if (!before) throw new Error("Entry not found");
    if (before.source === "weekly") {
      throw new Error("Weekly-sheet entries cannot be deleted directly. Edit the Weekly Collection Sheet instead.");
    }

    const { error } = await supabaseAdmin.from("passbook_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.rpc("recompute_passbook_balances", { _member: before.member_id } as any);
    await writeAudit({
      actorId: context.userId,
      action: "MANUAL_DELETE",
      recordId: data.id,
      oldValue: before,
      reason: data.reason,
    });
    return { ok: true };
  });

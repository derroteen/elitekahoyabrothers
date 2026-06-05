import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  const role = data?.role;
  if (role !== "super_admin" && role !== "admin") {
    throw new Error("Only Admins and Super Admins can manage opening balances");
  }
  return role as "super_admin" | "admin";
}

const OpeningRow = z.object({
  member_id: z.string().uuid(),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  opening_savings: z.number().min(0).default(0),
  opening_loan: z.number().min(0).default(0),
  opening_fine: z.number().min(0).default(0),
  opening_insurance: z.number().min(0).default(0),
  opening_benevolent: z.number().min(0).default(0),
  notes: z.string().max(2000).nullable().optional(),
});

export const upsertOpeningBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => OpeningRow.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("member_opening_balances")
      .upsert(
        {
          member_id: data.member_id,
          effective_date: data.effective_date,
          opening_savings: data.opening_savings,
          opening_loan: data.opening_loan,
          opening_fine: data.opening_fine,
          opening_insurance: data.opening_insurance,
          opening_benevolent: data.opening_benevolent,
          notes: data.notes ?? null,
          updated_by: context.userId,
          created_by: context.userId,
        },
        { onConflict: "member_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const BulkInput = z.object({
  rows: z.array(
    z.object({
      membership_no: z.string().min(1).max(50),
      effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      opening_savings: z.number().min(0),
      opening_loan: z.number().min(0),
      opening_fine: z.number().min(0),
      opening_insurance: z.number().min(0),
      opening_benevolent: z.number().min(0),
      notes: z.string().max(2000).optional().nullable(),
    }),
  ).min(1).max(2000),
});

export const bulkImportOpeningBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BulkInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const nos = Array.from(new Set(data.rows.map((r) => r.membership_no.toUpperCase())));
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, membership_no")
      .in("membership_no", nos);
    if (pErr) throw new Error(pErr.message);
    const map = new Map((profiles ?? []).map((p) => [String(p.membership_no).toUpperCase(), p.id]));

    const errors: { row: number; membership_no: string; error: string }[] = [];
    const valid: any[] = [];
    data.rows.forEach((r, idx) => {
      const memberId = map.get(r.membership_no.toUpperCase());
      if (!memberId) {
        errors.push({ row: idx + 1, membership_no: r.membership_no, error: "Member not found" });
        return;
      }
      valid.push({
        member_id: memberId,
        effective_date: r.effective_date,
        opening_savings: r.opening_savings,
        opening_loan: r.opening_loan,
        opening_fine: r.opening_fine,
        opening_insurance: r.opening_insurance,
        opening_benevolent: r.opening_benevolent,
        notes: r.notes ?? null,
        created_by: context.userId,
        updated_by: context.userId,
      });
    });

    if (valid.length === 0) return { processed: 0, errors };

    const { error: upErr, count } = await supabaseAdmin
      .from("member_opening_balances")
      .upsert(valid, { onConflict: "member_id", count: "exact" });
    if (upErr) throw new Error(upErr.message);

    return { processed: count ?? valid.length, errors };
  });

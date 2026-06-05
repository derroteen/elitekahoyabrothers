import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

const UpdatePassbookEntryInput = z.object({
  id: z.string().uuid(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  savings: z.number().min(0),
  bonus: z.number().min(0),
  withdrawal: z.number().min(0),
  loan_payment: z.number().min(0),
  remarks: z.string().max(2000).nullable().optional(),
  treasurer_sign: z.string().max(200).nullable().optional(),
});

export const updatePassbookEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdatePassbookEntryInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Fetch the entry being edited to get member_id
    const { data: targetEntry, error: targetErr } = await supabaseAdmin
      .from("passbook_entries")
      .select("id, member_id")
      .eq("id", data.id)
      .single();
    if (targetErr || !targetEntry) throw new Error("Entry not found");

    const memberId = targetEntry.member_id;

    // 2. Fetch all entries for this member
    const { data: allEntries, error: allErr } = await supabaseAdmin
      .from("passbook_entries")
      .select("id, entry_date, savings, bonus, total, withdrawal, balance, loan_payment, loan_balance")
      .eq("member_id", memberId)
      .order("entry_date", { ascending: true })
      .order("id", { ascending: true });
    if (allErr) throw new Error(allErr.message);

    // 3. Fetch opening balance
    const { data: ob } = await supabaseAdmin
      .from("member_opening_balances")
      .select("opening_savings, opening_loan")
      .eq("member_id", memberId)
      .maybeSingle();

    let prevBalance = Number(ob?.opening_savings ?? 0);
    let prevLoanBal = Number(ob?.opening_loan ?? 0);

    // 4. Build updated list and recalculate running balances
    const rows = (allEntries ?? []).map((r) => {
      if (r.id === data.id) {
        return {
          ...r,
          entry_date: data.entry_date,
          savings: data.savings,
          bonus: data.bonus,
          withdrawal: data.withdrawal,
          loan_payment: data.loan_payment,
          remarks: data.remarks ?? null,
          treasurer_sign: data.treasurer_sign ?? null,
        };
      }
      return r;
    });

    // Re-sort by date then id to handle entry_date changes
    rows.sort((a, b) => {
      const d = a.entry_date.localeCompare(b.entry_date);
      if (d !== 0) return d;
      return a.id.localeCompare(b.id);
    });

    const toUpdate: any[] = [];

    for (const r of rows) {
      const total = Number(r.savings) + Number(r.bonus);
      const balance = prevBalance + total - Number(r.withdrawal);
      const loanBalance = Math.max(0, prevLoanBal - Number(r.loan_payment));

      if (
        Number(r.total) !== total ||
        Number(r.balance) !== balance ||
        Number(r.loan_balance) !== loanBalance
      ) {
        toUpdate.push({
          id: r.id,
          total,
          balance,
          loan_balance: loanBalance,
        });
      }

      prevBalance = balance;
      prevLoanBal = loanBalance;
    }

    // 5. Update changed rows in batches (Supabase supports batch upsert/updates via .upsert)
    // Since we need to update specific columns with different values per row,
    // we use individual .update calls.
    for (const u of toUpdate) {
      const { error } = await supabaseAdmin
        .from("passbook_entries")
        .update({
          total: u.total,
          balance: u.balance,
          loan_balance: u.loan_balance,
        })
        .eq("id", u.id);
      if (error) throw new Error(error.message);
    }

    // Also update the editable fields on the target row (date, savings, bonus, withdrawal, loan_payment, remarks, sign)
    const { error: editErr } = await supabaseAdmin
      .from("passbook_entries")
      .update({
        entry_date: data.entry_date,
        savings: data.savings,
        bonus: data.bonus,
        withdrawal: data.withdrawal,
        loan_payment: data.loan_payment,
        remarks: data.remarks ?? null,
        treasurer_sign: data.treasurer_sign ?? null,
      })
      .eq("id", data.id);
    if (editErr) throw new Error(editErr.message);

    return { ok: true, recalculated: toUpdate.length };
  });

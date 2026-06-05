// Helpers for "Brought Forward Balance" passbook integration.
import { supabase } from "@/integrations/supabase/client";

export interface OpeningBalance {
  member_id: string;
  effective_date: string;
  opening_savings: number;
  opening_loan: number;
  opening_fine: number;
  opening_insurance: number;
  opening_benevolent: number;
  notes: string | null;
}

export async function fetchOpeningBalance(memberId: string): Promise<OpeningBalance | null> {
  const { data } = await supabase
    .from("member_opening_balances")
    .select("*")
    .eq("member_id", memberId)
    .maybeSingle();
  if (!data) return null;
  return {
    member_id: data.member_id,
    effective_date: data.effective_date as unknown as string,
    opening_savings: Number(data.opening_savings ?? 0),
    opening_loan: Number(data.opening_loan ?? 0),
    opening_fine: Number(data.opening_fine ?? 0),
    opening_insurance: Number(data.opening_insurance ?? 0),
    opening_benevolent: Number(data.opening_benevolent ?? 0),
    notes: (data as any).notes ?? null,
  };
}

export async function fetchOpeningBalancesMap(memberIds: string[]): Promise<Map<string, OpeningBalance>> {
  if (memberIds.length === 0) return new Map();
  const { data } = await supabase
    .from("member_opening_balances")
    .select("*")
    .in("member_id", memberIds);
  const out = new Map<string, OpeningBalance>();
  for (const r of data ?? []) {
    out.set(r.member_id, {
      member_id: r.member_id,
      effective_date: r.effective_date as unknown as string,
      opening_savings: Number(r.opening_savings ?? 0),
      opening_loan: Number(r.opening_loan ?? 0),
      opening_fine: Number(r.opening_fine ?? 0),
      opening_insurance: Number(r.opening_insurance ?? 0),
      opening_benevolent: Number(r.opening_benevolent ?? 0),
      notes: (r as any).notes ?? null,
    });
  }
  return out;
}

/**
 * Build a synthetic "Brought Forward Balance" passbook row.
 * Returns null if there is no opening balance to display.
 */
export function broughtForwardRow(ob: OpeningBalance | null): any | null {
  if (!ob) return null;
  const hasAny =
    ob.opening_savings > 0 ||
    ob.opening_loan > 0 ||
    ob.opening_fine > 0 ||
    ob.opening_insurance > 0 ||
    ob.opening_benevolent > 0;
  if (!hasAny) return null;
  return {
    id: `bf-${ob.member_id}`,
    entry_date: ob.effective_date,
    savings: ob.opening_savings,
    bonus: 0,
    total: ob.opening_savings,
    withdrawal: 0,
    balance: ob.opening_savings,
    loan_payment: 0,
    loan_balance: ob.opening_loan,
    fine_balance: ob.opening_fine,
    insurance_balance: ob.opening_insurance,
    benevolent_balance: ob.opening_benevolent,
    remarks: "Brought Forward Balance",
    treasurer_sign: "B/F",
    __brought_forward: true,
  };
}

/** Prepend the B/F row to a sorted-ascending list of passbook entries. */
export function withBroughtForward(entries: any[], ob: OpeningBalance | null): any[] {
  const bf = broughtForwardRow(ob);
  return bf ? [bf, ...entries] : entries;
}

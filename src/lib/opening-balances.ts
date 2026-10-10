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
    effective_date: (data.effective_date as unknown as string) ?? "2026-01-01",
    opening_savings: Number(data.opening_savings ?? 0),
    opening_loan: Number(data.opening_loan ?? 0),
    opening_fine: Number(data.opening_fine ?? 0),
    opening_insurance: Number(data.opening_insurance ?? 0),
    opening_benevolent: Number(data.opening_benevolent ?? 0),
    notes: (data as any)?.notes ?? null,
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
    description: ob.opening_loan > 0 && ob.opening_savings <= 0 ? "Balance Brought Forward - Loan" : "Brought Forward Balance",
    remarks: ob.opening_loan > 0 && ob.opening_savings <= 0 ? "Balance Brought Forward - Loan" : "Brought Forward Balance",
    treasurer_sign: "B/F",
    __brought_forward: true,
  };
}

/** Prepend the B/F row to a sorted-ascending list of passbook entries. */
export function withBroughtForward(entries: any[], ob: OpeningBalance | null): any[] {
  const bf = broughtForwardRow(ob);
  let savingsBalance = Number(bf?.balance ?? 0);
  let loanBalance = Number(bf?.loan_balance ?? 0);
  const adjusted = entries.map((entry) => {
    const total = Number(entry.savings ?? 0) + Number(entry.bonus ?? 0);
    savingsBalance += total - Number(entry.withdrawal ?? 0);

    const category = String(entry.category ?? "").toLowerCase();
    const description = String(entry.description ?? "");
    const source = String((entry as any).source ?? "").toLowerCase();
    const loanDebit = Number(entry.loan_debit ?? 0);
    const loanPayment = Number(entry.loan_payment ?? 0);
    const isOpeningBF =
      category === "opening_loan" || /brought forward/i.test(description);

    // Loan issue rows in this app may store the issued amount in loan_payment.
    // Detect both explicit descriptions and category/source hints.
    const isLoanIssued =
      /loan issued/i.test(description) ||
      category === "loan_issued" ||
      (category === "loan" && (loanPayment > 0 || loanDebit > 0) && !/repay/i.test(description)) ||
      (source.includes("loan") && source.includes("issued") && (loanPayment > 0 || loanDebit > 0));

    if (isOpeningBF) {
      // Opening loan already reflected in bf.loan_balance — skip any opening duplicate value
    } else if (isLoanIssued) {
      // New loan issued: RESET running balance to issued amount.
      // Prefer loan_payment based on current passbook data shape, fallback to loan_debit.
      const issuedAmount = Math.max(loanPayment, loanDebit);
      loanBalance = Math.max(0, issuedAmount);
    } else if (loanPayment > 0) {
      // Repayment: subtract, never below 0
      loanBalance = Math.max(0, loanBalance - loanPayment);
    } else if (loanDebit > 0) {
      // Any other debit rows still add (legacy/backward compatibility)
      loanBalance = Math.max(0, loanBalance + loanDebit);
    }

    return {
      ...entry,
      total,
      balance: savingsBalance,
      loan_balance: loanBalance,
    };
  });
  return bf ? [bf, ...adjusted] : adjusted;
}

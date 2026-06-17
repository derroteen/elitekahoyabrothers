import { supabase } from "@/integrations/supabase/client";

export function isOpeningLoanId(loanId: string | null | undefined) {
  return String(loanId ?? "").startsWith("opening-");
}

export function normalizeLoanId(loanId: string) {
  return isOpeningLoanId(loanId) ? loanId.replace(/^opening-/, "") : loanId;
}

export function loanBaseAmount(loan: any) {
  if (!loan) return 0;
  if (loan.__opening) {
    return Number(loan.total_repayable ?? loan.opening_balance ?? loan.balance ?? loan.principal ?? 0);
  }
  return Number(
    loan.total_repayable ??
      (Number(loan.amount_borrowed ?? 0) + Number(loan.total_interest_added ?? 0)) ??
      0,
  );
}

export function calculateOutstandingBalanceFromData(loan: any, repayments: any[] = []) {
  const paid = repayments.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  return Math.max(0, loanBaseAmount(loan) - paid);
}

export async function calculateOutstandingBalance(loanId: string) {
  const normalizedId = normalizeLoanId(loanId);
  const opening = isOpeningLoanId(loanId);

  if (opening) {
    const [{ data: loan, error: loanError }, { data: repayments, error: repaymentsError }] =
      await Promise.all([
        (supabase as any)
          .from("loan_opening_balances")
          .select("*")
          .eq("id", normalizedId)
          .single(),
        (supabase as any)
          .from("loan_repayments")
          .select("amount")
          .eq("opening_loan_id", normalizedId),
      ]);
    if (loanError) throw loanError;
    if (repaymentsError) throw repaymentsError;
    return calculateOutstandingBalanceFromData({ ...loan, __opening: true }, repayments ?? []);
  }

  const [{ data: loan, error: loanError }, { data: repayments, error: repaymentsError }] =
    await Promise.all([
      supabase.from("loans").select("*").eq("id", normalizedId).single(),
      supabase.from("loan_repayments").select("amount").eq("loan_id", normalizedId),
    ]);
  if (loanError) throw loanError;
  if (repaymentsError) throw repaymentsError;
  return calculateOutstandingBalanceFromData(loan, repayments ?? []);
}

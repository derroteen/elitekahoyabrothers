import { supabase } from "@/integrations/supabase/client";

export type PassbookLoanRepayment = {
  amount: number;
  payment_date: string;
  loan_id: string | null;
  opening_loan_id: string | null;
};

export type PassbookLoanDisplay = {
  split: true;
  rows: {
    payments: (number | null)[];
    balances: ({ amount: number; cleared: boolean } | null)[];
  }[];
};

type PassbookEntryRow = {
  entry_date: string;
  loan_payment?: number | null;
  loan_balance?: number | null;
  __brought_forward?: boolean;
};

export async function fetchPassbookLoanRepayments(
  loanIds: string[],
  openingLoanIds: string[],
): Promise<PassbookLoanRepayment[]> {
  const [regularResult, openingResult] = await Promise.all([
    loanIds.length > 0
      ? supabase
          .from("loan_repayments")
          .select("amount, payment_date, loan_id, opening_loan_id")
          .in("loan_id", loanIds)
      : Promise.resolve({ data: [], error: null }),
    openingLoanIds.length > 0
      ? supabase
          .from("loan_repayments")
          .select("amount, payment_date, loan_id, opening_loan_id")
          .in("opening_loan_id", openingLoanIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (regularResult.error) throw regularResult.error;
  if (openingResult.error) throw openingResult.error;
  return [...(regularResult.data ?? []), ...(openingResult.data ?? [])];
}

export function buildPassbookLoanDisplay(
  entries: PassbookEntryRow[],
  loans: {
    id: string;
    type: "loan" | "opening";
    total_repayable: number;
    sort_date?: string | null;
    repayments?: PassbookLoanRepayment[];
  }[],
): PassbookLoanDisplay | null {
  if (loans.length !== 2) return null;

  const sortedLoans = [...loans].sort((a, b) =>
    String(a.sort_date ?? "").localeCompare(String(b.sort_date ?? "")),
  );
  const repaymentForLoan = (loan: (typeof sortedLoans)[number], repayment: PassbookLoanRepayment) =>
    (loan.type === "loan" && repayment.loan_id === loan.id) ||
    (loan.type === "opening" && repayment.opening_loan_id === loan.id);
  const balanceAt = (loan: (typeof sortedLoans)[number], date: string) =>
    Math.max(
      0,
      Number(loan.total_repayable ?? 0) -
        (loan.repayments ?? [])
          .filter(
            (repayment) => repaymentForLoan(loan, repayment) && repayment.payment_date <= date,
          )
          .reduce((total, repayment) => total + Number(repayment.amount ?? 0), 0),
    );

  const hasTwoOverlappingLoans = entries.some((entry) => {
    const date = String(entry.entry_date ?? "");
    return (
      sortedLoans.filter(
        (loan) => loan.sort_date && loan.sort_date <= date && balanceAt(loan, date) > 0,
      ).length === 2
    );
  });
  if (!hasTwoOverlappingLoans) return null;

  const paymentsByRow = entries.map(() => [null, null] as (number | null)[]);
  for (const loan of sortedLoans) {
    const rowIndicesByDate = new Map<string, number[]>();
    entries.forEach((entry, index) => {
      if (!entry.__brought_forward) {
        const indices = rowIndicesByDate.get(String(entry.entry_date)) ?? [];
        indices.push(index);
        rowIndicesByDate.set(String(entry.entry_date), indices);
      }
    });

    for (const [date, rowIndices] of rowIndicesByDate) {
      if (!loan.sort_date || loan.sort_date > date) continue;
      const payment = (loan.repayments ?? [])
        .filter((repayment) => repaymentForLoan(loan, repayment) && repayment.payment_date === date)
        .reduce((total, repayment) => total + Number(repayment.amount ?? 0), 0);
      if (payment <= 0) continue;
      const targetIndex =
        rowIndices.find((index) => Number(entries[index].loan_payment ?? 0) > 0) ?? rowIndices[0];
      const loanIndex = sortedLoans.indexOf(loan);
      paymentsByRow[targetIndex][loanIndex] = payment;
    }
  }

  const previousBalances = sortedLoans.map((loan) => Number(loan.total_repayable ?? 0));
  const cleared = sortedLoans.map(() => false);
  const rows = entries.map((entry, rowIndex) => {
    if (entry.__brought_forward) {
      return {
        payments: [null, null],
        balances: [{ amount: Number(entry.loan_balance ?? 0), cleared: false }, null],
      };
    }

    const date = String(entry.entry_date ?? "");
    const balances = sortedLoans.map((loan, loanIndex) => {
      if (!loan.sort_date || loan.sort_date > date) return null;
      const amount = balanceAt(loan, date);
      const isCleared = !cleared[loanIndex] && previousBalances[loanIndex] > 0 && amount === 0;
      if (isCleared) cleared[loanIndex] = true;
      previousBalances[loanIndex] = amount;
      return { amount, cleared: isCleared };
    });
    return { payments: paymentsByRow[rowIndex], balances };
  });

  return { split: true, rows };
}

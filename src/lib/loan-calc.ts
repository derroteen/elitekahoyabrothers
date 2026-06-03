// Loan calculation helpers
// Insurance formula: (5.03 * months * 3.03 * totalLoanWithInterest) / 6000
// Interest compounded annually: A = P * (1 + r) ^ (months / 12)

export type Frequency = "weekly" | "monthly";

export interface LoanCalc {
  principal: number;
  interestRate: number;     // annual %, e.g. 10 means 10%
  termMonths: number;
  frequency: Frequency;
  withInterest: number;     // principal + compound interest
  insurance: number;
  totalRepayable: number;   // withInterest + insurance
  periods: number;          // number of periods
  periodPayment: number;    // payment per period
}

export function calcLoan(principal: number, ratePct: number, termMonths: number, frequency: Frequency): LoanCalc {
  const p = Math.max(0, Number(principal) || 0);
  const r = Math.max(0, Number(ratePct) || 0) / 100;
  const t = Math.max(1, Number(termMonths) || 1);

  const withInterest = p * Math.pow(1 + r, t / 12);
  const insurance = (5.03 * t * 3.03 * withInterest) / 6000;
  const totalRepayable = withInterest + insurance;

  const periods = frequency === "weekly" ? Math.max(1, Math.round((t / 12) * 52)) : t;
  const periodPayment = totalRepayable / periods;

  return {
    principal: p,
    interestRate: ratePct,
    termMonths: t,
    frequency,
    withInterest: round2(withInterest),
    insurance: round2(insurance),
    totalRepayable: round2(totalRepayable),
    periods,
    periodPayment: round2(periodPayment),
  };
}

function round2(n: number) { return Math.round(n * 100) / 100; }

export function buildSchedule(loanDate: string, calc: LoanCalc) {
  const start = new Date(loanDate);
  const rows: { period_number: number; due_date: string; expected_amount: number; balance_remaining: number }[] = [];
  let remaining = calc.totalRepayable;
  for (let i = 1; i <= calc.periods; i++) {
    const due = new Date(start);
    if (calc.frequency === "weekly") due.setDate(due.getDate() + 7 * i);
    else due.setMonth(due.getMonth() + i);
    const expected = i === calc.periods ? round2(remaining) : calc.periodPayment;
    remaining = round2(remaining - expected);
    rows.push({
      period_number: i,
      due_date: due.toISOString().slice(0, 10),
      expected_amount: expected,
      balance_remaining: Math.max(0, remaining),
    });
  }
  return rows;
}


-- Derive passbook loan_balance from authoritative loan outstanding sums as of each entry date.
-- Cleared loans contribute 0 automatically; new loans start a fresh sequence; duplicate
-- loan_payment rows no longer skew the running loan_balance column.

CREATE OR REPLACE FUNCTION public.recompute_passbook_balances(_member uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  prev_bal numeric := 0;
  v_total numeric;
  v_bal numeric;
  v_loan numeric;
  v_open record;
BEGIN
  SELECT COALESCE(opening_savings,0) AS s INTO v_open
    FROM public.member_opening_balances WHERE member_id = _member;
  IF FOUND THEN prev_bal := v_open.s; END IF;

  FOR rec IN
    SELECT id, entry_date, savings, bonus, withdrawal
    FROM public.passbook_entries
    WHERE member_id = _member
    ORDER BY entry_date ASC, created_at ASC, id ASC
  LOOP
    v_total := COALESCE(rec.savings,0) + COALESCE(rec.bonus,0);
    v_bal := prev_bal + v_total - COALESCE(rec.withdrawal,0);

    -- Authoritative loan balance = sum of outstanding across every loan
    -- (regular + opening) the member holds as of this entry's date.
    -- Pending/rejected loans excluded. Cleared loans contribute 0.
    SELECT
      COALESCE((
        SELECT SUM(GREATEST(0,
          COALESCE(l.total_repayable,0)
          - COALESCE((
              SELECT SUM(amount) FROM public.loan_repayments
              WHERE loan_id = l.id AND payment_date <= rec.entry_date
            ), 0)
        ))
        FROM public.loans l
        WHERE l.member_id = _member
          AND l.loan_date <= rec.entry_date
          AND l.status NOT IN ('pending','rejected')
      ), 0)
      +
      COALESCE((
        SELECT SUM(GREATEST(0,
          COALESCE(o.total_repayable,0)
          - COALESCE((
              SELECT SUM(amount) FROM public.loan_repayments
              WHERE opening_loan_id = o.id AND payment_date <= rec.entry_date
            ), 0)
        ))
        FROM public.loan_opening_balances o
        WHERE o.member_id = _member
          AND o.loan_date <= rec.entry_date
      ), 0)
    INTO v_loan;

    UPDATE public.passbook_entries
      SET total = v_total, balance = v_bal, loan_balance = COALESCE(v_loan,0)
      WHERE id = rec.id;

    prev_bal := v_bal;
  END LOOP;
END
$function$;

-- Recompute for every member that has a passbook so existing rows update immediately.
DO $$
DECLARE m record;
BEGIN
  FOR m IN SELECT DISTINCT member_id FROM public.passbook_entries LOOP
    PERFORM public.recompute_passbook_balances(m.member_id);
  END LOOP;
END $$;

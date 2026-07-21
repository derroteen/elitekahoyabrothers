CREATE OR REPLACE FUNCTION public.recompute_passbook_balances(_member uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  prev_bal numeric := 0;
  prev_loan numeric := 0;
  v_total numeric;
  v_bal numeric;
  v_loan numeric;
  v_open record;
  v_description text;
  v_category text;
  v_issued_amount numeric;
BEGIN
  SELECT
    COALESCE(opening_savings, 0) AS opening_savings,
    COALESCE(opening_loan, 0) AS opening_loan
  INTO v_open
  FROM public.member_opening_balances
  WHERE member_id = _member;

  IF FOUND THEN
    prev_bal := v_open.opening_savings;
    prev_loan := v_open.opening_loan;
  END IF;

  FOR rec IN
    SELECT id, entry_date, created_at, category, description, savings, bonus, withdrawal, loan_payment, loan_debit
    FROM public.passbook_entries
    WHERE member_id = _member
    ORDER BY entry_date ASC, created_at ASC, id ASC
  LOOP
    v_total := COALESCE(rec.savings, 0) + COALESCE(rec.bonus, 0);
    v_bal := prev_bal + v_total - COALESCE(rec.withdrawal, 0);
    v_loan := prev_loan;
    v_category := lower(COALESCE(rec.category, ''));
    v_description := COALESCE(rec.description, '');

    IF v_category = 'opening_loan' OR v_description ILIKE '%brought forward%' THEN
      -- Opening loan has already been carried into prev_loan from member_opening_balances.
      v_loan := prev_loan;
    ELSIF v_category = 'loan_issued' OR v_description ILIKE '%loan issued%' THEN
      -- A new loan starts a fresh loan balance. Historical rows may store the issued
      -- amount in either loan_debit or loan_payment, so accept either value.
      v_issued_amount := GREATEST(COALESCE(rec.loan_debit, 0), COALESCE(rec.loan_payment, 0));
      v_loan := GREATEST(0, v_issued_amount);
    ELSIF COALESCE(rec.loan_payment, 0) > 0 THEN
      v_loan := GREATEST(0, prev_loan - COALESCE(rec.loan_payment, 0));
    ELSIF COALESCE(rec.loan_debit, 0) > 0 THEN
      v_loan := GREATEST(0, prev_loan + COALESCE(rec.loan_debit, 0));
    END IF;

    UPDATE public.passbook_entries
    SET total = v_total,
        balance = v_bal,
        loan_balance = v_loan
    WHERE id = rec.id;

    prev_bal := v_bal;
    prev_loan := v_loan;
  END LOOP;
END
$function$;

DO $$
DECLARE m record;
BEGIN
  FOR m IN SELECT DISTINCT member_id FROM public.passbook_entries LOOP
    PERFORM public.recompute_passbook_balances(m.member_id);
  END LOOP;
END $$;
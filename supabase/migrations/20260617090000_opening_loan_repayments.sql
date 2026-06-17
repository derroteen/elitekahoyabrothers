ALTER TABLE public.loan_repayments
  ALTER COLUMN loan_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS opening_loan_id uuid REFERENCES public.loan_opening_balances(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS loan_repayments_opening_loan_idx
  ON public.loan_repayments(opening_loan_id);

ALTER TABLE public.loan_repayments
  DROP CONSTRAINT IF EXISTS loan_repayments_one_loan_ref;

ALTER TABLE public.loan_repayments
  ADD CONSTRAINT loan_repayments_one_loan_ref
  CHECK (
    (loan_id IS NOT NULL AND opening_loan_id IS NULL)
    OR
    (loan_id IS NULL AND opening_loan_id IS NOT NULL)
  );

DROP POLICY IF EXISTS "view repayments" ON public.loan_repayments;
CREATE POLICY "view repayments" ON public.loan_repayments FOR SELECT TO authenticated
  USING (
    public.can_view_all(auth.uid())
    OR EXISTS (SELECT 1 FROM public.loans l WHERE l.id = loan_id AND l.member_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.loan_opening_balances ol WHERE ol.id = opening_loan_id AND ol.member_id = auth.uid())
  );

ALTER TABLE public.loan_opening_balances
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

CREATE OR REPLACE FUNCTION public.recalculate_opening_loan_balance(_opening_loan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_paid numeric := 0;
  v_base numeric := 0;
  v_balance numeric := 0;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
    FROM public.loan_repayments
    WHERE opening_loan_id = _opening_loan_id;

  SELECT COALESCE(total_repayable, 0)
    INTO v_base
    FROM public.loan_opening_balances
    WHERE id = _opening_loan_id;

  v_balance := GREATEST(0, v_base - v_paid);

  UPDATE public.loan_opening_balances
     SET amount_paid = v_paid,
         balance = v_balance,
         status = CASE WHEN v_balance <= 0 THEN 'cleared' ELSE 'active' END
   WHERE id = _opening_loan_id;
END $$;

CREATE OR REPLACE FUNCTION public.recalculate_all_opening_loan_balances()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN SELECT id FROM public.loan_opening_balances LOOP
    PERFORM public.recalculate_opening_loan_balance(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

GRANT EXECUTE ON FUNCTION public.recalculate_opening_loan_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_all_opening_loan_balances() TO authenticated;

SELECT public.recalculate_all_opening_loan_balances();

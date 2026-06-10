
-- 1. Add insurance-tracking + start-date columns to loans
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS insurance_paid numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_balance numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_start_date date;

-- 2. Recompute existing loans so total_repayable = principal + simple interest (no insurance)
UPDATE public.loans
SET total_repayable = ROUND(amount_borrowed + (amount_borrowed * interest_rate / 100.0 * loan_term_months / 12.0) + COALESCE(total_interest_added,0), 2),
    insurance_balance = GREATEST(0, COALESCE(insurance,0) - COALESCE(insurance_paid,0)),
    payment_start_date = (loan_date + INTERVAL '1 month')::date;

UPDATE public.loans
SET balance = GREATEST(0, total_repayable - amount_paid);

UPDATE public.loans
SET period_payment = ROUND(CASE WHEN payment_frequency = 'weekly'
    THEN total_repayable / GREATEST(1, ROUND(loan_term_months / 12.0 * 52))
    ELSE total_repayable / GREATEST(1, loan_term_months) END, 2);

-- 3. Rebuild schedule expected_amount from the new period_payment
UPDATE public.loan_schedule s
SET expected_amount = l.period_payment,
    balance_remaining = GREATEST(0, l.balance)
FROM public.loans l
WHERE s.loan_id = l.id;

-- 4. Insurance payments ledger
CREATE TABLE IF NOT EXISTS public.loan_insurance_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL,
  balance_after numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_insurance_payments TO authenticated;
GRANT ALL ON public.loan_insurance_payments TO service_role;
ALTER TABLE public.loan_insurance_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Insurance payments viewable by member or staff"
  ON public.loan_insurance_payments FOR SELECT TO authenticated
  USING (
    public.can_view_all(auth.uid())
    OR EXISTS (SELECT 1 FROM public.loans l WHERE l.id = loan_id AND l.member_id = auth.uid())
  );

CREATE POLICY "Insurance payments managed by staff"
  ON public.loan_insurance_payments FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS loan_insurance_payments_loan_idx ON public.loan_insurance_payments(loan_id, payment_date);

-- 5. RPC to post insurance payments
CREATE OR REPLACE FUNCTION public.record_insurance_payment(
  _loan_id uuid,
  _amount numeric,
  _payment_date date DEFAULT CURRENT_DATE,
  _notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE loan_rec record; new_bal numeric;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: staff only';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Insurance payment amount must be positive';
  END IF;
  SELECT * INTO loan_rec FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan not found'; END IF;
  new_bal := GREATEST(0, COALESCE(loan_rec.insurance_balance,0) - _amount);
  UPDATE public.loans
    SET insurance_paid = COALESCE(insurance_paid,0) + _amount,
        insurance_balance = new_bal
   WHERE id = _loan_id;
  INSERT INTO public.loan_insurance_payments(loan_id, payment_date, amount, balance_after, notes, created_by)
    VALUES (_loan_id, _payment_date, _amount, new_bal, _notes, auth.uid());
  RETURN jsonb_build_object('insurance_balance', new_bal, 'insurance_paid', loan_rec.insurance_paid + _amount);
END $$;

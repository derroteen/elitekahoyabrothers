
CREATE OR REPLACE FUNCTION public.recalc_loan_from_payments(_loan_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  loan_rec record;
  pay_rec record;
  sched_rec record;
  fine_rec record;
  remaining numeric;
  pay numeric;
  total_principal numeric := 0;
  total_fine_paid numeric := 0;
  new_status loan_status;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: staff only';
  END IF;

  SELECT * INTO loan_rec FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan not found'; END IF;

  UPDATE public.loan_schedule
     SET amount_paid = 0, payment_date = NULL, prepaid = false,
         status = 'pending', fine_paid = 0
   WHERE loan_id = _loan_id;

  UPDATE public.loan_fines
     SET amount_paid = 0,
         status = CASE WHEN status = 'waived' THEN 'waived' ELSE 'unpaid' END
   WHERE loan_id = _loan_id;

  FOR pay_rec IN
    SELECT * FROM public.loan_repayments
     WHERE loan_id = _loan_id
     ORDER BY payment_date ASC, created_at ASC, id ASC
  LOOP
    remaining := pay_rec.amount;

    FOR fine_rec IN SELECT * FROM public.loan_fines
      WHERE loan_id = _loan_id AND amount > amount_paid AND status <> 'waived'
      ORDER BY fine_date, created_at LOOP
      EXIT WHEN remaining <= 0;
      pay := LEAST(remaining, fine_rec.amount - fine_rec.amount_paid);
      UPDATE public.loan_fines
         SET amount_paid = amount_paid + pay,
             status = CASE WHEN amount_paid + pay >= amount THEN 'paid' ELSE 'partial' END
       WHERE id = fine_rec.id;
      IF fine_rec.schedule_id IS NOT NULL THEN
        UPDATE public.loan_schedule SET fine_paid = fine_paid + pay WHERE id = fine_rec.schedule_id;
      END IF;
      remaining := remaining - pay;
      total_fine_paid := total_fine_paid + pay;
    END LOOP;

    FOR sched_rec IN SELECT * FROM public.loan_schedule
      WHERE loan_id = _loan_id AND amount_paid < expected_amount AND status NOT IN ('paid','prepaid')
      ORDER BY period_number LOOP
      EXIT WHEN remaining <= 0;
      pay := LEAST(remaining, sched_rec.expected_amount - sched_rec.amount_paid);
      UPDATE public.loan_schedule
         SET amount_paid = amount_paid + pay,
             payment_date = COALESCE(payment_date, pay_rec.payment_date),
             status = CASE WHEN amount_paid + pay >= expected_amount THEN 'paid' ELSE status END
       WHERE id = sched_rec.id;
      remaining := remaining - pay;
      total_principal := total_principal + pay;
    END LOOP;

    IF remaining > 0 THEN
      FOR sched_rec IN SELECT * FROM public.loan_schedule
        WHERE loan_id = _loan_id AND status NOT IN ('paid','prepaid')
        ORDER BY period_number LOOP
        EXIT WHEN remaining <= 0;
        pay := LEAST(remaining, sched_rec.expected_amount - sched_rec.amount_paid);
        UPDATE public.loan_schedule
           SET amount_paid = amount_paid + pay,
               payment_date = pay_rec.payment_date,
               prepaid = true,
               status = CASE WHEN amount_paid + pay >= expected_amount THEN 'prepaid' ELSE status END
         WHERE id = sched_rec.id;
        remaining := remaining - pay;
        total_principal := total_principal + pay;
      END LOOP;
    END IF;
  END LOOP;

  SELECT * INTO loan_rec FROM public.loans WHERE id = _loan_id;
  new_status := loan_rec.status;

  IF loan_rec.status NOT IN ('pending','rejected') THEN
    IF total_principal >= loan_rec.total_repayable - 0.01 THEN
      IF (loan_rec.total_fines_charged - total_fine_paid) > 0 THEN
        new_status := 'completed_with_fine';
      ELSE
        new_status := 'completed';
      END IF;
    ELSE
      IF loan_rec.status IN ('completed','completed_with_fine') THEN
        new_status := 'active';
      END IF;
    END IF;
  END IF;

  UPDATE public.loans SET
    amount_paid = total_principal + total_fine_paid,
    balance = GREATEST(0, total_repayable - total_principal),
    total_fines_paid = total_fine_paid,
    outstanding_fines = GREATEST(0, total_fines_charged - total_fine_paid),
    status = new_status
   WHERE id = _loan_id;
END $$;


CREATE OR REPLACE FUNCTION public.recalc_insurance_from_payments(_loan_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  loan_rec record;
  pay_rec record;
  total_ins numeric := 0;
  running numeric;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: staff only';
  END IF;
  SELECT * INTO loan_rec FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan not found'; END IF;
  running := COALESCE(loan_rec.insurance, 0);
  FOR pay_rec IN SELECT * FROM public.loan_insurance_payments
    WHERE loan_id = _loan_id
    ORDER BY payment_date ASC, created_at ASC, id ASC LOOP
    total_ins := total_ins + pay_rec.amount;
    running := GREATEST(0, COALESCE(loan_rec.insurance,0) - total_ins);
    UPDATE public.loan_insurance_payments SET balance_after = running WHERE id = pay_rec.id;
  END LOOP;
  UPDATE public.loans
     SET insurance_paid = total_ins,
         insurance_balance = GREATEST(0, COALESCE(insurance,0) - total_ins)
   WHERE id = _loan_id;
END $$;

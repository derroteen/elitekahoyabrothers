
-- Restrict audit_logs INSERT to staff only
DROP POLICY IF EXISTS "staff insert audit" ON public.audit_logs;
CREATE POLICY "staff insert audit" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- Restrict weekly_collections SELECT to staff/auditors
DROP POLICY IF EXISTS "view weekly collections" ON public.weekly_collections;
CREATE POLICY "view weekly collections" ON public.weekly_collections FOR SELECT TO authenticated USING (public.can_view_all(auth.uid()));

-- Restrict notifications INSERT to staff only
DROP POLICY IF EXISTS "staff insert notifications" ON public.notifications;
CREATE POLICY "staff insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- Add staff guard to apply_loan_fines
CREATE OR REPLACE FUNCTION public.apply_loan_fines(_loan_id uuid DEFAULT NULL::uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE rec record; charged integer := 0;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Permission denied: staff only'; END IF;
  FOR rec IN
    SELECT s.id, s.loan_id FROM public.loan_schedule s
    JOIN public.loans l ON l.id = s.loan_id
    WHERE (_loan_id IS NULL OR s.loan_id = _loan_id)
      AND s.due_date < CURRENT_DATE AND s.prepaid = false
      AND s.amount_paid < s.expected_amount AND s.status NOT IN ('paid','prepaid')
      AND l.status NOT IN ('completed','rejected','closed')
      AND NOT EXISTS (SELECT 1 FROM public.loan_fines f WHERE f.schedule_id = s.id)
  LOOP
    INSERT INTO public.loan_fines(loan_id, schedule_id, amount, reason, status, fine_date)
    VALUES (rec.loan_id, rec.id, 200, 'Missed installment penalty', 'unpaid', CURRENT_DATE);
    UPDATE public.loan_schedule SET fine_amount = fine_amount + 200, status = 'overdue' WHERE id = rec.id;
    UPDATE public.loans SET total_fines_charged = total_fines_charged + 200, outstanding_fines = outstanding_fines + 200 WHERE id = rec.loan_id;
    charged := charged + 1;
  END LOOP;
  RETURN charged;
END $function$;

-- Add staff guard to apply_annual_interest
CREATE OR REPLACE FUNCTION public.apply_annual_interest(_loan_id uuid DEFAULT NULL::uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE rec record; applied integer := 0; yrs_since integer; add_amt numeric(14,2);
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Permission denied: staff only'; END IF;
  FOR rec IN
    SELECT * FROM public.loans
    WHERE (_loan_id IS NULL OR id = _loan_id)
      AND status IN ('active','approved','overdue') AND balance > 0
  LOOP
    yrs_since := EXTRACT(YEAR FROM age(CURRENT_DATE, rec.loan_date))::int;
    IF yrs_since >= 1 AND (rec.last_interest_year IS NULL OR rec.last_interest_year < yrs_since) THEN
      add_amt := round(rec.balance * (rec.interest_rate / 100.0), 2);
      UPDATE public.loans
        SET balance = balance + add_amt, total_repayable = total_repayable + add_amt,
            total_interest_added = total_interest_added + add_amt, last_interest_year = yrs_since
        WHERE id = rec.id;
      applied := applied + 1;
    END IF;
  END LOOP;
  RETURN applied;
END $function$;

-- Add owner/staff guard to record_loan_repayment
CREATE OR REPLACE FUNCTION public.record_loan_repayment(_loan_id uuid, _amount numeric, _payment_date date DEFAULT CURRENT_DATE, _notes text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  remaining numeric := _amount; fine_rec record; sched_rec record; pay numeric;
  loan_rec record; total_fine_paid numeric := 0; total_principal_paid numeric := 0;
  installments_covered integer := 0; new_status loan_status;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: staff only';
  END IF;
  SELECT * INTO loan_rec FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan not found'; END IF;

  FOR fine_rec IN SELECT * FROM public.loan_fines WHERE loan_id = _loan_id AND amount > amount_paid ORDER BY fine_date, created_at LOOP
    EXIT WHEN remaining <= 0;
    pay := LEAST(remaining, fine_rec.amount - fine_rec.amount_paid);
    UPDATE public.loan_fines SET amount_paid = amount_paid + pay,
      status = CASE WHEN amount_paid + pay >= amount THEN 'paid' ELSE 'partial' END WHERE id = fine_rec.id;
    IF fine_rec.schedule_id IS NOT NULL THEN
      UPDATE public.loan_schedule SET fine_paid = fine_paid + pay WHERE id = fine_rec.schedule_id;
    END IF;
    remaining := remaining - pay; total_fine_paid := total_fine_paid + pay;
  END LOOP;

  FOR sched_rec IN SELECT * FROM public.loan_schedule
    WHERE loan_id = _loan_id AND amount_paid < expected_amount AND status NOT IN ('paid','prepaid') ORDER BY period_number LOOP
    EXIT WHEN remaining <= 0;
    pay := LEAST(remaining, sched_rec.expected_amount - sched_rec.amount_paid);
    UPDATE public.loan_schedule SET amount_paid = amount_paid + pay,
      payment_date = COALESCE(payment_date, _payment_date),
      status = CASE WHEN amount_paid + pay >= expected_amount THEN 'paid' ELSE status END WHERE id = sched_rec.id;
    remaining := remaining - pay; total_principal_paid := total_principal_paid + pay;
    IF sched_rec.amount_paid + pay >= sched_rec.expected_amount THEN installments_covered := installments_covered + 1; END IF;
  END LOOP;

  IF remaining > 0 THEN
    FOR sched_rec IN SELECT * FROM public.loan_schedule
      WHERE loan_id = _loan_id AND status NOT IN ('paid','prepaid') ORDER BY period_number LOOP
      EXIT WHEN remaining <= 0;
      pay := LEAST(remaining, sched_rec.expected_amount - sched_rec.amount_paid);
      UPDATE public.loan_schedule SET amount_paid = amount_paid + pay, payment_date = _payment_date, prepaid = true,
        status = CASE WHEN amount_paid + pay >= expected_amount THEN 'prepaid' ELSE status END,
        remarks = COALESCE(remarks,'') || ' [prepaid]' WHERE id = sched_rec.id;
      remaining := remaining - pay; total_principal_paid := total_principal_paid + pay;
      installments_covered := installments_covered + 1;
    END LOOP;
  END IF;

  INSERT INTO public.loan_repayments(loan_id, amount, payment_date, notes, created_by)
  VALUES (_loan_id, _amount, _payment_date, _notes, auth.uid());

  SELECT * INTO loan_rec FROM public.loans WHERE id = _loan_id;
  new_status := loan_rec.status;
  IF (loan_rec.balance - total_principal_paid) <= 0 THEN
    IF (loan_rec.outstanding_fines - total_fine_paid) > 0 THEN new_status := 'completed_with_fine';
    ELSE new_status := 'completed'; END IF;
  ELSIF loan_rec.status = 'approved' THEN new_status := 'active';
  END IF;

  UPDATE public.loans SET amount_paid = amount_paid + (total_principal_paid + total_fine_paid),
    balance = GREATEST(0, balance - total_principal_paid),
    total_fines_paid = total_fines_paid + total_fine_paid,
    outstanding_fines = GREATEST(0, outstanding_fines - total_fine_paid),
    status = new_status WHERE id = _loan_id;

  RETURN jsonb_build_object('fine_paid', total_fine_paid, 'principal_paid', total_principal_paid,
    'excess', remaining, 'installments_covered', installments_covered, 'new_status', new_status);
END $function$;

-- Restrict email_for_membership_no to authenticated users only
REVOKE EXECUTE ON FUNCTION public.email_for_membership_no(text) FROM anon;

-- Fix mutable search_path on touch_updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END $function$;

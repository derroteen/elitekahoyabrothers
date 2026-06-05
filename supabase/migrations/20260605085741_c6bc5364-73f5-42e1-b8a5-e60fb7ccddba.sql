
-- 1. Extend loan_repayments with breakdown + source link
ALTER TABLE public.loan_repayments
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS fine_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS principal_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS weekly_entry_id UUID UNIQUE REFERENCES public.weekly_collection_entries(id) ON DELETE SET NULL;

-- 2. Replace record_loan_repayment to accept payment_method/source and store breakdown
CREATE OR REPLACE FUNCTION public.record_loan_repayment(
  _loan_id uuid,
  _amount numeric,
  _payment_date date DEFAULT CURRENT_DATE,
  _notes text DEFAULT NULL,
  _payment_method text DEFAULT NULL,
  _source text DEFAULT 'manual',
  _weekly_entry_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  INSERT INTO public.loan_repayments(loan_id, amount, payment_date, notes, created_by,
    payment_method, fine_paid, principal_paid, source, weekly_entry_id)
  VALUES (_loan_id, _amount, _payment_date, _notes, auth.uid(),
    _payment_method, total_fine_paid, total_principal_paid, COALESCE(_source,'manual'), _weekly_entry_id);

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

-- 3. Trigger: auto-post loan repayment from weekly_collection_entries.loan_refund.
-- Posts to the member's oldest active loan with outstanding balance.
-- INSERT only: editing/deleting a weekly entry does NOT reverse loan allocations
-- (admin must record a manual adjustment if needed).
CREATE OR REPLACE FUNCTION public.auto_post_weekly_loan_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_loan_id uuid;
  v_date date;
  v_week int;
BEGIN
  IF COALESCE(NEW.loan_refund, 0) <= 0 THEN
    RETURN NEW;
  END IF;
  -- Skip if a repayment already exists for this weekly entry (idempotency on re-save)
  IF EXISTS (SELECT 1 FROM public.loan_repayments WHERE weekly_entry_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_loan_id FROM public.loans
    WHERE member_id = NEW.member_id
      AND status IN ('approved','active','overdue','completed_with_fine')
      AND balance > 0
    ORDER BY loan_date ASC, created_at ASC
    LIMIT 1;
  IF v_loan_id IS NULL THEN
    RAISE NOTICE 'No active loan for member % — weekly loan_refund of % not auto-posted',
      NEW.member_id, NEW.loan_refund;
    RETURN NEW;
  END IF;
  SELECT collection_date, week_number INTO v_date, v_week
    FROM public.weekly_collections WHERE id = NEW.collection_id;
  PERFORM public.record_loan_repayment(
    v_loan_id,
    NEW.loan_refund,
    v_date,
    'Weekly Sheet · Week ' || v_week,
    'weekly_collection',
    'weekly',
    NEW.id
  );
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS auto_post_weekly_loan_refund_trg ON public.weekly_collection_entries;
CREATE TRIGGER auto_post_weekly_loan_refund_trg
  AFTER INSERT ON public.weekly_collection_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_post_weekly_loan_refund();

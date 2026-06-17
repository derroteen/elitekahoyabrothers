
-- Migration 1: Add backfill function for missing loan repayments
CREATE OR REPLACE FUNCTION public.backfill_missing_loan_repayments()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int := 0;
  v_entry record;
  v_loan_id uuid;
  v_date date;
  v_week int;
BEGIN
  -- Find all weekly collection entries with loan_refund > 0 and no corresponding repayment
  FOR v_entry IN
    SELECT we.id, we.member_id, we.loan_refund, wc.collection_date, wc.week_number
    FROM public.weekly_collection_entries we
    JOIN public.weekly_collections wc ON we.collection_id = wc.id
    WHERE we.loan_refund > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.loan_repayments lr
        WHERE lr.weekly_entry_id = we.id
      )
  LOOP
    -- Find the member's active loan
    SELECT id INTO v_loan_id
    FROM public.loans
    WHERE member_id = v_entry.member_id
      AND status IN ('approved', 'active', 'overdue', 'completed_with_fine')
      AND balance > 0
    ORDER BY loan_date ASC, created_at ASC
    LIMIT 1;

    IF v_loan_id IS NOT NULL THEN
      -- Call record_loan_repayment
      PERFORM public.record_loan_repayment(
        v_loan_id,
        v_entry.loan_refund,
        v_entry.collection_date,
        'Weekly Sheet - Week ' || v_entry.week_number,
        'weekly_collection',
        'weekly',
        v_entry.id
      );
      v_count := v_count + 1;
    ELSE
      RAISE NOTICE 'No active loan for member % - skipped backfilling loan_refund of %',
        v_entry.member_id, v_entry.loan_refund;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Migration 2: Update handle_david_split_payment with date condition and auto-stop
CREATE OR REPLACE FUNCTION public.handle_david_split_payment(
  v_member_id uuid,
  v_amount numeric,
  v_payment_date date,
  v_notes text,
  v_weekly_entry_id uuid,
  v_collection_date date,
  v_week_number int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_regular_loan_id uuid;
  v_opening_loan_id uuid;
  v_regular_balance numeric;
  v_opening_balance numeric;
  v_regular_amount numeric;
  v_opening_amount numeric;
  v_split_start_date date := '2026-03-19'::date;
BEGIN
  -- Find David's regular loan and check balance
  SELECT id, balance INTO v_regular_loan_id, v_regular_balance
  FROM public.loans
  WHERE member_id = v_member_id
    AND status IN ('approved', 'active', 'overdue', 'completed_with_fine')
    AND balance > 0
  ORDER BY loan_date ASC, created_at ASC
  LIMIT 1;

  -- Find David's opening loan and check balance (id: ee120e49-0e13-4706-889f-99484ed93034)
  SELECT id, balance INTO v_opening_loan_id, v_opening_balance
  FROM public.loan_opening_balances
  WHERE id = 'ee120e49-0e13-4706-889f-99484ed93034'::uuid
    AND balance > 0
  LIMIT 1;

  -- Check auto-stop conditions
  IF v_regular_loan_id IS NULL OR v_opening_loan_id IS NULL OR v_regular_balance = 0 OR v_opening_balance = 0 THEN
    -- If only one loan exists or one is cleared, post full amount to the remaining loan
    IF v_regular_loan_id IS NOT NULL AND v_regular_balance > 0 THEN
      PERFORM public.record_loan_repayment(
        v_regular_loan_id,
        v_amount,
        v_payment_date,
        v_notes,
        'weekly_collection',
        'weekly',
        v_weekly_entry_id
      );
    ELSIF v_opening_loan_id IS NOT NULL AND v_opening_balance > 0 THEN
      INSERT INTO public.loan_repayments(
        opening_loan_id,
        amount,
        payment_date,
        notes,
        payment_method,
        source,
        weekly_entry_id,
        principal_paid,
        fine_paid,
        created_by
      ) VALUES (
        v_opening_loan_id,
        v_amount,
        v_payment_date,
        v_notes,
        'weekly_collection',
        'weekly',
        v_weekly_entry_id,
        v_amount,
        0,
        auth.uid()
      );
      PERFORM public.recalculate_opening_loan_balance(v_opening_loan_id);
    ELSE
      RAISE NOTICE 'Both of David''s loans are cleared - skipping payment of %', v_amount;
    END IF;
    RETURN;
  END IF;

  -- Check if payment date is before split start date
  IF v_collection_date < v_split_start_date THEN
    -- Post full amount to regular loan
    PERFORM public.record_loan_repayment(
      v_regular_loan_id,
      v_amount,
      v_payment_date,
      v_notes,
      'weekly_collection',
      'weekly',
      v_weekly_entry_id
    );
    RETURN;
  END IF;

  -- Calculate split amounts for dates on or after split start
  v_regular_amount := LEAST(v_amount, 1000);
  v_opening_amount := GREATEST(0, v_amount - 1000);

  -- Record regular loan payment
  IF v_regular_amount > 0 THEN
    PERFORM public.record_loan_repayment(
      v_regular_loan_id,
      v_regular_amount,
      v_payment_date,
      v_notes,
      'weekly_collection',
      'weekly',
      v_weekly_entry_id
    );
  END IF;

  -- Record opening loan payment if remaining amount
  IF v_opening_amount > 0 THEN
    INSERT INTO public.loan_repayments(
      opening_loan_id,
      amount,
      payment_date,
      notes,
      payment_method,
      source,
      weekly_entry_id,
      principal_paid,
      fine_paid,
      created_by
    ) VALUES (
      v_opening_loan_id,
      v_opening_amount,
      v_payment_date,
      v_notes,
      'weekly_collection',
      'weekly',
      v_weekly_entry_id,
      v_opening_amount,
      0,
      auth.uid()
    );
    PERFORM public.recalculate_opening_loan_balance(v_opening_loan_id);
  END IF;
END;
$$;

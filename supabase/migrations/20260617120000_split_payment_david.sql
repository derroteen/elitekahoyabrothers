﻿﻿﻿﻿﻿
-- Migration for David Omari Kianga's split payment logic

-- Create a function to handle split payments for David
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
  v_regular_amount numeric;
  v_opening_amount numeric;
BEGIN
  -- Find David's regular loan (oldest active)
  SELECT id INTO v_regular_loan_id FROM public.loans
    WHERE member_id = v_member_id
      AND status IN ('approved','active','overdue','completed_with_fine')
      AND balance > 0
    ORDER BY loan_date ASC, created_at ASC
    LIMIT 1;
  
  -- Find David's opening loan (oldest active)
  SELECT id INTO v_opening_loan_id FROM public.loan_opening_balances
    WHERE member_id = v_member_id
      AND balance > 0
    ORDER BY loan_date ASC, created_at ASC
    LIMIT 1;
  
  -- Calculate split amounts
  v_regular_amount := LEAST(v_amount, 1000);
  v_opening_amount := GREATEST(0, v_amount - 1000);
  
  -- Record regular loan payment if we found a regular loan
  IF v_regular_loan_id IS NOT NULL AND v_regular_amount > 0 THEN
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
  
  -- Record opening loan payment if we found an opening loan and have remaining amount
  IF v_opening_loan_id IS NOT NULL AND v_opening_amount > 0 THEN
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
    
    -- Recalculate opening loan balance
    PERFORM public.recalculate_opening_loan_balance(v_opening_loan_id);
  END IF;
  
  -- If only one loan exists, fallback to original behavior
  IF (v_regular_loan_id IS NULL OR v_opening_loan_id IS NULL) THEN
    IF v_regular_loan_id IS NOT NULL THEN
      PERFORM public.record_loan_repayment(
        v_regular_loan_id,
        v_amount,
        v_payment_date,
        v_notes,
        'weekly_collection',
        'weekly',
        v_weekly_entry_id
      );
    ELSIF v_opening_loan_id IS NOT NULL THEN
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
    END IF;
  END IF;
END;
$$;

-- Update auto_post_weekly_loan_refund to check if member is David using member_id
CREATE OR REPLACE FUNCTION public.auto_post_weekly_loan_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  
  -- Check if member is David using his confirmed member_id
  IF NEW.member_id = 'b06d7bd0-2fbe-4d5c-a875-e0901ff37900'::uuid THEN
    SELECT collection_date, week_number INTO v_date, v_week
      FROM public.weekly_collections WHERE id = NEW.collection_id;
    PERFORM public.handle_david_split_payment(
      NEW.member_id,
      NEW.loan_refund,
      v_date,
      'Weekly Sheet - Week ' || v_week,
      NEW.id,
      v_date,
      v_week
    );
    RETURN NEW;
  END IF;
  
  -- Original behavior for all other members
  SELECT id INTO v_loan_id FROM public.loans
    WHERE member_id = NEW.member_id
      AND status IN ('approved','active','overdue','completed_with_fine')
      AND balance > 0
    ORDER BY loan_date ASC, created_at ASC
    LIMIT 1;
  IF v_loan_id IS NULL THEN
    RAISE NOTICE 'No active loan for member % - weekly loan_refund of % not auto-posted',
      NEW.member_id, NEW.loan_refund;
    RETURN NEW;
  END IF;
  SELECT collection_date, week_number INTO v_date, v_week
    FROM public.weekly_collections WHERE id = NEW.collection_id;
  PERFORM public.record_loan_repayment(
    v_loan_id,
    NEW.loan_refund,
    v_date,
    'Weekly Sheet - Week ' || v_week,
    'weekly_collection',
    'weekly',
    NEW.id
  );
  RETURN NEW;
END;
$$;


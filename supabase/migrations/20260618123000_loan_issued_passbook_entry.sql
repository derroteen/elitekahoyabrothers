
-- Create a trigger that inserts a "Loan Issued" passbook entry when a loan is approved
CREATE OR REPLACE FUNCTION public.auto_create_loan_issued_passbook_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only proceed if loan is moving to 'approved' or 'active' from non-approved status
  IF (NEW.status IN ('approved', 'active') AND OLD.status NOT IN ('approved', 'active')) THEN
    -- Insert passbook entry
    INSERT INTO public.passbook_entries (
      member_id,
      entry_date,
      description,
      loan_payment,
      remarks,
      source,
      created_by
    ) VALUES (
      NEW.member_id,
      NEW.loan_date,
      'Loan Issued',
      NEW.total_repayable,
      'Loan Issued - Total Repayable: ' || NEW.total_repayable,
      'system',
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists, then create it
DROP TRIGGER IF EXISTS loan_issued_passbook_trigger ON public.loans;
CREATE TRIGGER loan_issued_passbook_trigger
  AFTER UPDATE ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_loan_issued_passbook_entry();

-- Create repair function to backfill missing "Loan Issued" entries
CREATE OR REPLACE FUNCTION public.repair_missing_loan_issued_entries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loan RECORD;
  v_count integer := 0;
BEGIN
  -- Loop through all approved/active loans
  FOR v_loan IN 
    SELECT l.* 
    FROM public.loans l
    WHERE l.status IN ('approved', 'active', 'overdue', 'completed_with_fine', 'paid', 'completed')
  LOOP
    -- Check if passbook entry already exists for this loan
    IF NOT EXISTS (
      SELECT 1 
      FROM public.passbook_entries pe
      WHERE pe.member_id = v_loan.member_id
        AND pe.entry_date = v_loan.loan_date
        AND pe.description = 'Loan Issued'
        AND pe.loan_payment = v_loan.total_repayable
    ) THEN
      -- Insert missing entry
      INSERT INTO public.passbook_entries (
        member_id,
        entry_date,
        description,
        loan_payment,
        remarks,
        source,
        created_by
      ) VALUES (
        v_loan.member_id,
        v_loan.loan_date,
        'Loan Issued',
        v_loan.total_repayable,
        'Loan Issued - Total Repayable: ' || v_loan.total_repayable,
        'system_repair',
        NULL
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

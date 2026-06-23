
-- Create junction table for passbook entry loan payments
CREATE TABLE IF NOT EXISTS public.passbook_entry_loan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passbook_entry_id UUID NOT NULL REFERENCES public.passbook_entries(id) ON DELETE CASCADE,
  loan_id UUID REFERENCES public.loans(id) ON DELETE CASCADE,
  opening_loan_id UUID REFERENCES public.loan_opening_balances(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  CONSTRAINT chk_one_loan CHECK (
    (loan_id IS NOT NULL AND opening_loan_id IS NULL) OR
    (loan_id IS NULL AND opening_loan_id IS NOT NULL)
  )
);

-- Create index for fast lookups by passbook entry
CREATE INDEX IF NOT EXISTS idx_passbook_entry_loan_payments_entry_id ON public.passbook_entry_loan_payments(passbook_entry_id);

-- Create index for fast lookups by loan
CREATE INDEX IF NOT EXISTS idx_passbook_entry_loan_payments_loan_id ON public.passbook_entry_loan_payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_passbook_entry_loan_payments_opening_loan_id ON public.passbook_entry_loan_payments(opening_loan_id);

-- Backfill existing data from passbook_entries into new table
INSERT INTO public.passbook_entry_loan_payments (passbook_entry_id, loan_id, opening_loan_id, amount)
SELECT 
  id AS passbook_entry_id,
  loan_id,
  opening_loan_id,
  loan_payment AS amount
FROM public.passbook_entries
WHERE (loan_id IS NOT NULL OR opening_loan_id IS NOT NULL) AND loan_payment > 0;


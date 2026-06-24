
-- Enable RLS on passbook_entry_loan_payments and scope read policy on loan_repayments to authenticated only

ALTER TABLE public.passbook_entry_loan_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view passbook entry loan payments"
ON public.passbook_entry_loan_payments
FOR SELECT
TO authenticated
USING (
  public.can_view_all(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.passbook_entries pe
    WHERE pe.id = passbook_entry_loan_payments.passbook_entry_id
      AND pe.member_id = auth.uid()
  )
);

CREATE POLICY "staff write passbook entry loan payments"
ON public.passbook_entry_loan_payments
FOR ALL
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

-- Tighten loan_repayments read policy: restrict to authenticated role only
DROP POLICY IF EXISTS "view repayments" ON public.loan_repayments;

CREATE POLICY "view repayments"
ON public.loan_repayments
FOR SELECT
TO authenticated
USING (
  public.can_view_all(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.loans l
    WHERE l.id = loan_repayments.loan_id AND l.member_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.loan_opening_balances lob
    WHERE lob.id = loan_repayments.opening_loan_id AND lob.member_id = auth.uid()
  )
);

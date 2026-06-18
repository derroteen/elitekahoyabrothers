
-- Restrict loan_opening_balances SELECT to owner or staff
DROP POLICY IF EXISTS "Anyone authenticated can read opening loans" ON public.loan_opening_balances;
CREATE POLICY "View own or staff opening loans"
ON public.loan_opening_balances
FOR SELECT
TO authenticated
USING (member_id = auth.uid() OR public.can_view_all(auth.uid()));

-- Enable RLS on opening_loan_fines and add policies
ALTER TABLE public.opening_loan_fines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view opening loan fines"
ON public.opening_loan_fines
FOR SELECT
TO authenticated
USING (
  public.can_view_all(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.loan_opening_balances l
    WHERE l.id = opening_loan_fines.opening_loan_id
      AND l.member_id = auth.uid()
  )
);

CREATE POLICY "staff write opening loan fines"
ON public.opening_loan_fines
FOR ALL
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

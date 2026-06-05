
CREATE TABLE public.member_opening_balances (
  member_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  opening_savings numeric(14,2) NOT NULL DEFAULT 0,
  opening_loan numeric(14,2) NOT NULL DEFAULT 0,
  opening_fine numeric(14,2) NOT NULL DEFAULT 0,
  opening_insurance numeric(14,2) NOT NULL DEFAULT 0,
  opening_benevolent numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT opening_savings_nonneg CHECK (opening_savings >= 0),
  CONSTRAINT opening_loan_nonneg CHECK (opening_loan >= 0),
  CONSTRAINT opening_fine_nonneg CHECK (opening_fine >= 0),
  CONSTRAINT opening_insurance_nonneg CHECK (opening_insurance >= 0),
  CONSTRAINT opening_benevolent_nonneg CHECK (opening_benevolent >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_opening_balances TO authenticated;
GRANT ALL ON public.member_opening_balances TO service_role;

ALTER TABLE public.member_opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own opening balance"
  ON public.member_opening_balances FOR SELECT
  TO authenticated
  USING (
    member_id = auth.uid()
    OR public.can_view_all(auth.uid())
  );

CREATE POLICY "Staff insert opening balances"
  ON public.member_opening_balances FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff update opening balances"
  ON public.member_opening_balances FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff delete opening balances"
  ON public.member_opening_balances FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE TRIGGER member_opening_balances_touch_updated_at
  BEFORE UPDATE ON public.member_opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER member_opening_balances_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.member_opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();


CREATE TABLE public.loan_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  loan_date date NOT NULL,
  principal numeric(14,2) NOT NULL DEFAULT 0 CHECK (principal >= 0),
  interest_rate numeric(6,3) NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
  total_repayable numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_repayable >= 0),
  amount_paid numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  balance numeric(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX loan_opening_balances_member_idx ON public.loan_opening_balances(member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_opening_balances TO authenticated;
GRANT ALL ON public.loan_opening_balances TO service_role;

ALTER TABLE public.loan_opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read opening loans"
  ON public.loan_opening_balances FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can insert opening loans"
  ON public.loan_opening_balances FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff can update opening loans"
  ON public.loan_opening_balances FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Super admin can delete opening loans"
  ON public.loan_opening_balances FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER loan_opening_balances_touch
  BEFORE UPDATE ON public.loan_opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER loan_opening_balances_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.loan_opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

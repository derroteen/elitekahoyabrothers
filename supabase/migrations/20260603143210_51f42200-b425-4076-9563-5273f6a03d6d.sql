
-- Extend loans table
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS loan_term_months INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS total_repayable NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS period_payment NUMERIC NOT NULL DEFAULT 0;

-- Weekly collection sheets
CREATE TABLE IF NOT EXISTS public.weekly_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number INTEGER NOT NULL,
  collection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  treasurer_name TEXT,
  recorded_by UUID,
  banked_in_advance NUMERIC NOT NULL DEFAULT 0,
  cash_in_hand NUMERIC NOT NULL DEFAULT 0,
  banked_by TEXT,
  notes TEXT,
  locked BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(week_number, collection_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_collections TO authenticated;
GRANT ALL ON public.weekly_collections TO service_role;

ALTER TABLE public.weekly_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view weekly collections" ON public.weekly_collections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write weekly collections" ON public.weekly_collections
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER weekly_collections_touch BEFORE UPDATE ON public.weekly_collections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.weekly_collection_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES public.weekly_collections(id) ON DELETE CASCADE,
  member_id UUID NOT NULL,
  savings NUMERIC NOT NULL DEFAULT 0,
  loan_refund NUMERIC NOT NULL DEFAULT 0,
  benevolent_fund NUMERIC NOT NULL DEFAULT 0,
  fine NUMERIC NOT NULL DEFAULT 0,
  insurance NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_collection_entries TO authenticated;
GRANT ALL ON public.weekly_collection_entries TO service_role;

ALTER TABLE public.weekly_collection_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view collection entries" ON public.weekly_collection_entries
  FOR SELECT TO authenticated USING (
    public.can_view_all(auth.uid()) OR member_id = auth.uid()
  );
CREATE POLICY "staff write collection entries" ON public.weekly_collection_entries
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_wce_collection ON public.weekly_collection_entries(collection_id);
CREATE INDEX IF NOT EXISTS idx_wce_member ON public.weekly_collection_entries(member_id);

-- Repayment schedule
CREATE TABLE IF NOT EXISTS public.loan_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  period_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  expected_amount NUMERIC NOT NULL DEFAULT 0,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  balance_remaining NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_date DATE,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_schedule TO authenticated;
GRANT ALL ON public.loan_schedule TO service_role;

ALTER TABLE public.loan_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view loan schedule" ON public.loan_schedule
  FOR SELECT TO authenticated USING (
    public.can_view_all(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.loans l WHERE l.id = loan_schedule.loan_id AND l.member_id = auth.uid()
    )
  );
CREATE POLICY "staff write loan schedule" ON public.loan_schedule
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_sched_loan ON public.loan_schedule(loan_id);

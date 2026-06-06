
CREATE TABLE public.weekly_expenditures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expenditure_date date NOT NULL,
  week_number int NOT NULL DEFAULT 0,
  year int NOT NULL DEFAULT 0,
  particulars text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  quantity numeric(10,2),
  notes text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_expenditures TO authenticated;
GRANT ALL ON public.weekly_expenditures TO service_role;

ALTER TABLE public.weekly_expenditures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view expenditures"
  ON public.weekly_expenditures FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Staff can insert expenditures"
  ON public.weekly_expenditures FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff can update expenditures"
  ON public.weekly_expenditures FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff can delete expenditures"
  ON public.weekly_expenditures FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_expenditure_week()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.week_number := EXTRACT(week FROM NEW.expenditure_date)::int;
  NEW.year := EXTRACT(isoyear FROM NEW.expenditure_date)::int;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_expenditure_set_week
  BEFORE INSERT OR UPDATE ON public.weekly_expenditures
  FOR EACH ROW EXECUTE FUNCTION public.set_expenditure_week();

CREATE TRIGGER trg_expenditure_touch
  BEFORE UPDATE ON public.weekly_expenditures
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_expenditure_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.weekly_expenditures
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE INDEX idx_weekly_expenditures_date ON public.weekly_expenditures(expenditure_date DESC);
CREATE INDEX idx_weekly_expenditures_week ON public.weekly_expenditures(year, week_number);

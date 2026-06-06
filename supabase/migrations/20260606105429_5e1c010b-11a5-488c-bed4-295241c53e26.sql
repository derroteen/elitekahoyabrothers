
CREATE TABLE public.attendance_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  week_dates date[] NOT NULL DEFAULT '{}',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(year, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_sheets TO authenticated;
GRANT ALL ON public.attendance_sheets TO service_role;
ALTER TABLE public.attendance_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage attendance sheets" ON public.attendance_sheets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "View attendance sheets" ON public.attendance_sheets
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.attendance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES public.attendance_sheets(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_number int NOT NULL CHECK (week_number BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present','late','absent')),
  arrival_time time,
  fine_amount numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sheet_id, member_id, week_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_entries TO authenticated;
GRANT ALL ON public.attendance_entries TO service_role;
ALTER TABLE public.attendance_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage attendance entries" ON public.attendance_entries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Members view own/staff view all attendance" ON public.attendance_entries
  FOR SELECT TO authenticated
  USING (member_id = auth.uid() OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'auditor'));

CREATE OR REPLACE FUNCTION public.set_attendance_fine()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.fine_amount := CASE NEW.status WHEN 'absent' THEN 200 WHEN 'late' THEN 20 ELSE 0 END;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_attendance_fine
BEFORE INSERT OR UPDATE ON public.attendance_entries
FOR EACH ROW EXECUTE FUNCTION public.set_attendance_fine();

CREATE OR REPLACE FUNCTION public.touch_attendance_sheet()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_attendance_sheet_updated
BEFORE UPDATE ON public.attendance_sheets
FOR EACH ROW EXECUTE FUNCTION public.touch_attendance_sheet();

CREATE INDEX idx_attendance_entries_sheet ON public.attendance_entries(sheet_id);
CREATE INDEX idx_attendance_entries_member ON public.attendance_entries(member_id);

CREATE TABLE public.benevolent_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  transaction_type text NOT NULL DEFAULT 'contribution'
    CHECK (transaction_type IN ('contribution','withdrawal','adjustment','opening_balance')),
  contribution numeric(14,2) NOT NULL DEFAULT 0 CHECK (contribution >= 0),
  withdrawal  numeric(14,2) NOT NULL DEFAULT 0 CHECK (withdrawal  >= 0),
  balance     numeric(14,2) NOT NULL DEFAULT 0,
  description text,
  weekly_entry_id uuid UNIQUE REFERENCES public.weekly_collection_entries(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_benevolent_member_date ON public.benevolent_entries(member_id, entry_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.benevolent_entries TO authenticated;
GRANT ALL ON public.benevolent_entries TO service_role;

ALTER TABLE public.benevolent_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view benevolent entries" ON public.benevolent_entries
  FOR SELECT TO authenticated
  USING (member_id = auth.uid() OR public.can_view_all(auth.uid()));
CREATE POLICY "staff insert benevolent" ON public.benevolent_entries
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff update benevolent" ON public.benevolent_entries
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff delete benevolent" ON public.benevolent_entries
  FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

CREATE TRIGGER benevolent_entries_touch_updated_at
  BEFORE UPDATE ON public.benevolent_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER benevolent_entries_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.benevolent_entries
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

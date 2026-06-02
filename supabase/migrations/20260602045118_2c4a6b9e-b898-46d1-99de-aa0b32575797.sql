-- 1) RPC: resolve auth email from membership number (used by login).
-- SECURITY DEFINER so anon can resolve before signing in. Returns NULL if not found.
CREATE OR REPLACE FUNCTION public.email_for_membership_no(_membership_no text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE upper(membership_no) = upper(_membership_no) LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.email_for_membership_no(text) TO anon, authenticated;

-- Index for fast membership_no lookups (also enforces uniqueness)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_membership_no_unique ON public.profiles (upper(membership_no)) WHERE membership_no IS NOT NULL;

-- 2) System settings (singleton) for dev/production mode flag.
CREATE TABLE IF NOT EXISTS public.system_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  development_mode boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone authenticated can read settings"
  ON public.system_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "super admin updates settings"
  ON public.system_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

INSERT INTO public.system_settings (id, development_mode) VALUES (true, true)
  ON CONFLICT (id) DO NOTHING;
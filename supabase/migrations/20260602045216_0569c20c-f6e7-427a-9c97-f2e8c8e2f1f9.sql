CREATE OR REPLACE FUNCTION public.reset_membership_seq()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only super admins can reset the membership counter';
  END IF;
  PERFORM setval('public.membership_seq', 1, false);
END $$;

REVOKE EXECUTE ON FUNCTION public.reset_membership_seq() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_membership_seq() TO authenticated, service_role;
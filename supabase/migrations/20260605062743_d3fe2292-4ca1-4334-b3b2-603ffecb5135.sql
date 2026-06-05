CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_full_name TEXT;
  v_membership TEXT;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  -- SECURITY: Always default new signups to 'member'. Elevated roles must be
  -- assigned only through admin server functions that write directly to user_roles.
  v_membership := public.next_membership_no();

  INSERT INTO public.profiles(id, full_name, email, phone, membership_no, must_change_password)
  VALUES (
    NEW.id,
    v_full_name,
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    v_membership,
    COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, true)
  );

  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'member');
  RETURN NEW;
END $function$;
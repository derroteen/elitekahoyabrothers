-- Fix automatic membership number generation for new members.
-- 1. Ensure handle_new_user trigger exists on auth.users (recreate idempotently).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Backfill missing profile rows for any auth user that never got one
INSERT INTO public.profiles (id, full_name, email, phone, membership_no, must_change_password)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  u.email,
  u.raw_user_meta_data->>'phone',
  public.next_membership_no(),
  COALESCE((u.raw_user_meta_data->>'must_change_password')::boolean, true)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Also ensure they have a default role
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'member'::app_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
WHERE r.user_id IS NULL;

-- 3. Backfill membership_no for any profile that is missing one
UPDATE public.profiles
   SET membership_no = public.next_membership_no()
 WHERE membership_no IS NULL OR membership_no = '';
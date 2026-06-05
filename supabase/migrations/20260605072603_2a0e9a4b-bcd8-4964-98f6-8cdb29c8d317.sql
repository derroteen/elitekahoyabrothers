CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_src jsonb := COALESCE(v_new, v_old);
  v_rid text;
BEGIN
  v_rid := COALESCE(
    v_src->>'id',
    v_src->>'member_id',
    v_src->>'user_id'
  );

  INSERT INTO public.audit_logs(actor_id, action, table_name, record_id, old_value, new_value)
  VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, v_rid, v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END $function$;
CREATE OR REPLACE FUNCTION public.recompute_benevolent_balances(_member uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE rec record; prev_bal numeric := 0; v_open numeric; v_bal numeric;
BEGIN
  SELECT COALESCE(opening_benevolent, 0) INTO v_open
    FROM public.member_opening_balances WHERE member_id = _member;
  IF FOUND THEN prev_bal := v_open; END IF;
  FOR rec IN
    SELECT id, contribution, withdrawal FROM public.benevolent_entries
     WHERE member_id = _member
     ORDER BY entry_date ASC, created_at ASC, id ASC
  LOOP
    v_bal := prev_bal + COALESCE(rec.contribution,0) - COALESCE(rec.withdrawal,0);
    UPDATE public.benevolent_entries SET balance = v_bal WHERE id = rec.id;
    prev_bal := v_bal;
  END LOOP;
END $f$;

CREATE OR REPLACE FUNCTION public.benevolent_after_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_benevolent_balances(OLD.member_id);
    RETURN OLD;
  END IF;
  PERFORM public.recompute_benevolent_balances(NEW.member_id);
  IF TG_OP = 'UPDATE' AND OLD.member_id IS DISTINCT FROM NEW.member_id THEN
    PERFORM public.recompute_benevolent_balances(OLD.member_id);
  END IF;
  RETURN NEW;
END $f$;

CREATE TRIGGER benevolent_entries_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.benevolent_entries
  FOR EACH ROW EXECUTE FUNCTION public.benevolent_after_change();

CREATE OR REPLACE FUNCTION public.sync_weekly_benevolent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_collection record; v_desc text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.benevolent_entries WHERE weekly_entry_id = OLD.id;
    RETURN OLD;
  END IF;
  SELECT * INTO v_collection FROM public.weekly_collections WHERE id = NEW.collection_id;
  v_desc := 'Weekly Sheet . Week ' || v_collection.week_number;
  IF COALESCE(NEW.benevolent_fund, 0) <= 0 THEN
    DELETE FROM public.benevolent_entries WHERE weekly_entry_id = NEW.id;
    RETURN NEW;
  END IF;
  INSERT INTO public.benevolent_entries(
    member_id, entry_date, transaction_type, contribution, withdrawal,
    description, weekly_entry_id, source, created_by
  ) VALUES (
    NEW.member_id, v_collection.collection_date, 'contribution',
    COALESCE(NEW.benevolent_fund,0), 0, v_desc, NEW.id, 'weekly', auth.uid()
  )
  ON CONFLICT (weekly_entry_id) DO UPDATE SET
    member_id    = EXCLUDED.member_id,
    entry_date   = EXCLUDED.entry_date,
    contribution = EXCLUDED.contribution,
    description  = EXCLUDED.description;
  RETURN NEW;
END $f$;

CREATE TRIGGER weekly_entries_sync_benevolent
  AFTER INSERT OR UPDATE OR DELETE ON public.weekly_collection_entries
  FOR EACH ROW EXECUTE FUNCTION public.sync_weekly_benevolent();

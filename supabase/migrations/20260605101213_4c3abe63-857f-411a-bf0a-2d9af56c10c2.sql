
-- 1. Link column
ALTER TABLE public.savings_entries
  ADD COLUMN IF NOT EXISTS passbook_entry_id uuid UNIQUE
    REFERENCES public.passbook_entries(id) ON DELETE CASCADE;

-- 2. Recompute savings running balance from opening balance + ordered entries
CREATE OR REPLACE FUNCTION public.recompute_savings_balances(_member uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  prev_bal numeric := 0;
  v_total numeric;
  v_bal numeric;
  v_open record;
BEGIN
  SELECT COALESCE(opening_savings,0) AS s
    INTO v_open
    FROM public.member_opening_balances WHERE member_id = _member;
  IF FOUND THEN
    prev_bal := v_open.s;
  END IF;

  FOR rec IN
    SELECT id, amount, bonus, withdrawal
    FROM public.savings_entries
    WHERE member_id = _member
    ORDER BY entry_date ASC, created_at ASC, id ASC
  LOOP
    v_total := COALESCE(rec.amount,0) + COALESCE(rec.bonus,0);
    v_bal := prev_bal + v_total - COALESCE(rec.withdrawal,0);
    UPDATE public.savings_entries
       SET total = v_total, balance = v_bal
     WHERE id = rec.id;
    prev_bal := v_bal;
  END LOOP;
END $$;

-- 3. Trigger function to mirror passbook -> savings
CREATE OR REPLACE FUNCTION public.sync_passbook_to_savings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member uuid;
  v_old_member uuid;
  v_has_money boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old_member := OLD.member_id;
    DELETE FROM public.savings_entries WHERE passbook_entry_id = OLD.id;
    PERFORM public.recompute_savings_balances(v_old_member);
    RETURN OLD;
  END IF;

  v_member := NEW.member_id;
  v_has_money := COALESCE(NEW.savings,0) > 0
              OR COALESCE(NEW.bonus,0) > 0
              OR COALESCE(NEW.withdrawal,0) > 0;

  IF NOT v_has_money THEN
    DELETE FROM public.savings_entries WHERE passbook_entry_id = NEW.id;
  ELSE
    INSERT INTO public.savings_entries(
      passbook_entry_id, member_id, entry_date, amount, bonus, withdrawal, total, balance, notes, created_by
    ) VALUES (
      NEW.id, NEW.member_id, NEW.entry_date,
      COALESCE(NEW.savings,0), COALESCE(NEW.bonus,0), COALESCE(NEW.withdrawal,0),
      0, 0, NEW.description, NEW.created_by
    )
    ON CONFLICT (passbook_entry_id) DO UPDATE SET
      member_id = EXCLUDED.member_id,
      entry_date = EXCLUDED.entry_date,
      amount = EXCLUDED.amount,
      bonus = EXCLUDED.bonus,
      withdrawal = EXCLUDED.withdrawal,
      notes = EXCLUDED.notes;
  END IF;

  PERFORM public.recompute_savings_balances(v_member);
  IF TG_OP = 'UPDATE' AND OLD.member_id IS DISTINCT FROM NEW.member_id THEN
    PERFORM public.recompute_savings_balances(OLD.member_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_passbook_to_savings_trg ON public.passbook_entries;
CREATE TRIGGER sync_passbook_to_savings_trg
AFTER INSERT OR UPDATE OR DELETE ON public.passbook_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_passbook_to_savings();

-- 4. Backfill from existing passbook entries
INSERT INTO public.savings_entries(
  passbook_entry_id, member_id, entry_date, amount, bonus, withdrawal, total, balance, notes, created_by
)
SELECT p.id, p.member_id, p.entry_date,
       COALESCE(p.savings,0), COALESCE(p.bonus,0), COALESCE(p.withdrawal,0),
       0, 0, p.description, p.created_by
FROM public.passbook_entries p
WHERE (COALESCE(p.savings,0) > 0 OR COALESCE(p.bonus,0) > 0 OR COALESCE(p.withdrawal,0) > 0)
ON CONFLICT (passbook_entry_id) DO NOTHING;

-- Recompute balances for every member that has savings rows
DO $$
DECLARE m uuid;
BEGIN
  FOR m IN SELECT DISTINCT member_id FROM public.savings_entries LOOP
    PERFORM public.recompute_savings_balances(m);
  END LOOP;
END $$;

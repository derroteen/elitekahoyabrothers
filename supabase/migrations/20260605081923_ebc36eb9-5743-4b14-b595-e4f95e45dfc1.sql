
-- 1. Extend passbook_entries
ALTER TABLE public.passbook_entries
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS weekly_entry_id uuid UNIQUE REFERENCES public.weekly_collection_entries(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE public.passbook_entries
  DROP CONSTRAINT IF EXISTS passbook_entries_source_check;
ALTER TABLE public.passbook_entries
  ADD CONSTRAINT passbook_entries_source_check
  CHECK (source IN ('manual','weekly','opening'));

-- 2. Extend audit_logs
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS reason text;

-- 3. Recompute helper
CREATE OR REPLACE FUNCTION public.recompute_passbook_balances(_member uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  prev_bal numeric := 0;
  prev_loan numeric := 0;
  v_total numeric;
  v_bal numeric;
  v_loan numeric;
  v_open record;
BEGIN
  SELECT COALESCE(opening_savings,0) AS s, COALESCE(opening_loan,0) AS l
    INTO v_open
    FROM public.member_opening_balances WHERE member_id = _member;
  IF FOUND THEN
    prev_bal := v_open.s;
    prev_loan := v_open.l;
  END IF;

  FOR rec IN
    SELECT id, savings, bonus, withdrawal, loan_payment
    FROM public.passbook_entries
    WHERE member_id = _member
    ORDER BY entry_date ASC, created_at ASC, id ASC
  LOOP
    v_total := COALESCE(rec.savings,0) + COALESCE(rec.bonus,0);
    v_bal := prev_bal + v_total - COALESCE(rec.withdrawal,0);
    v_loan := GREATEST(0, prev_loan - COALESCE(rec.loan_payment,0));
    UPDATE public.passbook_entries
       SET total = v_total, balance = v_bal, loan_balance = v_loan
     WHERE id = rec.id;
    prev_bal := v_bal;
    prev_loan := v_loan;
  END LOOP;
END $$;

-- 4. Sync trigger: weekly_collection_entries -> passbook_entries
CREATE OR REPLACE FUNCTION public.sync_weekly_passbook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collection record;
  v_desc text;
  v_member uuid;
  v_old_member uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old_member := OLD.member_id;
    DELETE FROM public.passbook_entries WHERE weekly_entry_id = OLD.id;
    PERFORM public.recompute_passbook_balances(v_old_member);
    RETURN OLD;
  END IF;

  v_member := NEW.member_id;
  SELECT * INTO v_collection FROM public.weekly_collections WHERE id = NEW.collection_id;

  v_desc := 'Weekly Sheet · Week ' || v_collection.week_number;
  IF COALESCE(NEW.insurance,0) > 0 OR COALESCE(NEW.benevolent_fund,0) > 0 OR COALESCE(NEW.fine,0) > 0 THEN
    v_desc := v_desc || ' (';
    IF COALESCE(NEW.insurance,0) > 0 THEN
      v_desc := v_desc || 'Insurance ' || NEW.insurance::text || ' ';
    END IF;
    IF COALESCE(NEW.benevolent_fund,0) > 0 THEN
      v_desc := v_desc || 'Benevolent ' || NEW.benevolent_fund::text || ' ';
    END IF;
    IF COALESCE(NEW.fine,0) > 0 THEN
      v_desc := v_desc || 'Fine ' || NEW.fine::text || ' ';
    END IF;
    v_desc := trim(v_desc) || ')';
  END IF;

  -- Skip rows with no money at all
  IF COALESCE(NEW.savings,0) = 0
     AND COALESCE(NEW.loan_refund,0) = 0
     AND COALESCE(NEW.insurance,0) = 0
     AND COALESCE(NEW.benevolent_fund,0) = 0
     AND COALESCE(NEW.fine,0) = 0 THEN
    DELETE FROM public.passbook_entries WHERE weekly_entry_id = NEW.id;
    PERFORM public.recompute_passbook_balances(v_member);
    IF TG_OP = 'UPDATE' AND OLD.member_id IS DISTINCT FROM NEW.member_id THEN
      PERFORM public.recompute_passbook_balances(OLD.member_id);
    END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.passbook_entries (
    member_id, entry_date, savings, bonus, withdrawal, loan_payment,
    total, balance, loan_balance, remarks, description, category, source, weekly_entry_id
  ) VALUES (
    NEW.member_id, v_collection.collection_date,
    COALESCE(NEW.savings,0), 0, 0, COALESCE(NEW.loan_refund,0),
    0, 0, 0,
    v_desc, v_desc, 'weekly_collection', 'weekly', NEW.id
  )
  ON CONFLICT (weekly_entry_id) DO UPDATE SET
    member_id = EXCLUDED.member_id,
    entry_date = EXCLUDED.entry_date,
    savings = EXCLUDED.savings,
    loan_payment = EXCLUDED.loan_payment,
    description = EXCLUDED.description,
    remarks = EXCLUDED.remarks;

  PERFORM public.recompute_passbook_balances(v_member);
  IF TG_OP = 'UPDATE' AND OLD.member_id IS DISTINCT FROM NEW.member_id THEN
    PERFORM public.recompute_passbook_balances(OLD.member_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS weekly_entries_sync_passbook ON public.weekly_collection_entries;
CREATE TRIGGER weekly_entries_sync_passbook
AFTER INSERT OR UPDATE OR DELETE ON public.weekly_collection_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_weekly_passbook();

-- 5. Backfill existing weekly entries
INSERT INTO public.passbook_entries (
  member_id, entry_date, savings, bonus, withdrawal, loan_payment,
  total, balance, loan_balance, remarks, description, category, source, weekly_entry_id
)
SELECT
  wce.member_id,
  wc.collection_date,
  COALESCE(wce.savings,0),
  0,
  0,
  COALESCE(wce.loan_refund,0),
  0, 0, 0,
  'Weekly Sheet · Week ' || wc.week_number,
  'Weekly Sheet · Week ' || wc.week_number,
  'weekly_collection',
  'weekly',
  wce.id
FROM public.weekly_collection_entries wce
JOIN public.weekly_collections wc ON wc.id = wce.collection_id
WHERE COALESCE(wce.savings,0) + COALESCE(wce.loan_refund,0)
    + COALESCE(wce.insurance,0) + COALESCE(wce.benevolent_fund,0) + COALESCE(wce.fine,0) > 0
ON CONFLICT (weekly_entry_id) DO NOTHING;

-- 6. Recompute for every member who has any passbook entry
DO $$
DECLARE m uuid;
BEGIN
  FOR m IN SELECT DISTINCT member_id FROM public.passbook_entries LOOP
    PERFORM public.recompute_passbook_balances(m);
  END LOOP;
END $$;

-- 7. Mark existing entries that aren't weekly as 'manual' with reasonable category
UPDATE public.passbook_entries
  SET source = 'manual',
      category = CASE
        WHEN withdrawal > 0 THEN 'withdrawal'
        WHEN bonus > 0 THEN 'bonus'
        WHEN savings > 0 THEN 'savings'
        ELSE 'other'
      END
  WHERE source = 'manual' AND category = 'other' AND weekly_entry_id IS NULL;

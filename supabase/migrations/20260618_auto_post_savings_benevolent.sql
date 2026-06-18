
-- 1. Function to auto post savings from weekly entries
CREATE OR REPLACE FUNCTION public.auto_post_savings_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_weekly_id uuid;
  v_collection_date date;
  v_week_number integer;
  v_savings_amount numeric;
  v_member_id uuid;
BEGIN
  v_weekly_id := NEW.id;
  v_member_id := NEW.member_id;
  v_savings_amount := COALESCE(NEW.savings, 0);

  IF v_savings_amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- Check if already posted
  IF EXISTS (
    SELECT 1 FROM savings_entries
    WHERE weekly_entry_id = v_weekly_id
  ) THEN
    RETURN NEW;
  END IF;

  -- Get collection date and week number
  SELECT collection_date, week_number INTO v_collection_date, v_week_number
  FROM weekly_collections
  WHERE id = NEW.collection_id;

  -- Insert savings entry
  INSERT INTO savings_entries (
    member_id,
    amount,
    entry_date,
    remarks,
    source,
    weekly_entry_id
  ) VALUES (
    v_member_id,
    v_savings_amount,
    v_collection_date,
    'Weekly Sheet - Week ' || v_week_number,
    'weekly',
    v_weekly_id
  );

  -- Recompute savings balances
  PERFORM public.recompute_savings_balances(v_member_id);

  RETURN NEW;
END;
$$;

-- 2. Function to auto post benevolent from weekly entries
CREATE OR REPLACE FUNCTION public.auto_post_benevolent_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_weekly_id uuid;
  v_collection_date date;
  v_week_number integer;
  v_benevolent_amount numeric;
  v_member_id uuid;
BEGIN
  v_weekly_id := NEW.id;
  v_member_id := NEW.member_id;
  v_benevolent_amount := COALESCE(NEW.benevolent_fund, 0);

  IF v_benevolent_amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- Check if already posted
  IF EXISTS (
    SELECT 1 FROM benevolent_entries
    WHERE weekly_entry_id = v_weekly_id
  ) THEN
    RETURN NEW;
  END IF;

  -- Get collection date and week number
  SELECT collection_date, week_number INTO v_collection_date, v_week_number
  FROM weekly_collections
  WHERE id = NEW.collection_id;

  -- Insert benevolent entry
  INSERT INTO benevolent_entries (
    member_id,
    amount,
    entry_date,
    remarks,
    source,
    weekly_entry_id
  ) VALUES (
    v_member_id,
    v_benevolent_amount,
    v_collection_date,
    'Weekly Sheet - Week ' || v_week_number,
    'weekly',
    v_weekly_id
  );

  -- Recompute benevolent balances
  PERFORM public.recompute_benevolent_balances(v_member_id);

  RETURN NEW;
END;
$$;

-- 3. Create triggers
DROP TRIGGER IF EXISTS auto_post_savings ON weekly_collection_entries;
CREATE TRIGGER auto_post_savings
  AFTER INSERT OR UPDATE ON weekly_collection_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_post_savings_entry();

DROP TRIGGER IF EXISTS auto_post_benevolent ON weekly_collection_entries;
CREATE TRIGGER auto_post_benevolent
  AFTER INSERT OR UPDATE ON weekly_collection_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_post_benevolent_entry();

-- 4. Backfill function for savings and benevolent
CREATE OR REPLACE FUNCTION public.backfill_missing_savings_benevolent()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_entry record;
BEGIN
  -- Backfill savings
  FOR v_entry IN
    SELECT wce.*, wc.collection_date, wc.week_number
    FROM weekly_collection_entries wce
    JOIN weekly_collections wc ON wc.id = wce.collection_id
    WHERE wce.savings > 0
    AND NOT EXISTS (
      SELECT 1 FROM savings_entries se WHERE se.weekly_entry_id = wce.id
    )
  LOOP
    INSERT INTO savings_entries (
      member_id, amount, entry_date, remarks, source, weekly_entry_id
    ) VALUES (
      v_entry.member_id,
      v_entry.savings,
      v_entry.collection_date,
      'Weekly Sheet - Week ' || v_entry.week_number,
      'weekly',
      v_entry.id
    );
    PERFORM public.recompute_savings_balances(v_entry.member_id);
    v_count := v_count + 1;
  END LOOP;

  -- Backfill benevolent
  FOR v_entry IN
    SELECT wce.*, wc.collection_date, wc.week_number
    FROM weekly_collection_entries wce
    JOIN weekly_collections wc ON wc.id = wce.collection_id
    WHERE wce.benevolent_fund > 0
    AND NOT EXISTS (
      SELECT 1 FROM benevolent_entries be WHERE be.weekly_entry_id = wce.id
    )
  LOOP
    INSERT INTO benevolent_entries (
      member_id, amount, entry_date, remarks, source, weekly_entry_id
    ) VALUES (
      v_entry.member_id,
      v_entry.benevolent_fund,
      v_entry.collection_date,
      'Weekly Sheet - Week ' || v_entry.week_number,
      'weekly',
      v_entry.id
    );
    PERFORM public.recompute_benevolent_balances(v_entry.member_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

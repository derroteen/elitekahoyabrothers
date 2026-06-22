CREATE OR REPLACE FUNCTION public.backfill_missing_savings_benevolent()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
  v_savings_count integer := 0;
  v_benevolent_count integer := 0;
  v_member uuid;
  v_savings_members uuid[] := '{}'::uuid[];
  v_benevolent_members uuid[] := '{}'::uuid[];
BEGIN
  -- Backfill savings rows from existing passbook entries using the same
  -- mapping as sync_passbook_to_savings().
  SELECT COALESCE(array_agg(DISTINCT p.member_id), '{}'::uuid[])
    INTO v_savings_members
  FROM public.passbook_entries p
  WHERE (
      COALESCE(p.savings, 0) > 0
      OR COALESCE(p.bonus, 0) > 0
      OR COALESCE(p.withdrawal, 0) > 0
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.savings_entries se
      WHERE se.passbook_entry_id = p.id
    );

  INSERT INTO public.savings_entries(
    passbook_entry_id,
    member_id,
    entry_date,
    amount,
    bonus,
    withdrawal,
    total,
    balance,
    notes,
    created_by
  )
  SELECT
    p.id,
    p.member_id,
    p.entry_date,
    COALESCE(p.savings, 0),
    COALESCE(p.bonus, 0),
    COALESCE(p.withdrawal, 0),
    0,
    0,
    p.description,
    p.created_by
  FROM public.passbook_entries p
  WHERE (
      COALESCE(p.savings, 0) > 0
      OR COALESCE(p.bonus, 0) > 0
      OR COALESCE(p.withdrawal, 0) > 0
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.savings_entries se
      WHERE se.passbook_entry_id = p.id
    )
  ON CONFLICT (passbook_entry_id) DO UPDATE SET
    member_id = EXCLUDED.member_id,
    entry_date = EXCLUDED.entry_date,
    amount = EXCLUDED.amount,
    bonus = EXCLUDED.bonus,
    withdrawal = EXCLUDED.withdrawal,
    notes = EXCLUDED.notes,
    created_by = EXCLUDED.created_by;

  GET DIAGNOSTICS v_savings_count = ROW_COUNT;

  IF array_length(v_savings_members, 1) IS NOT NULL THEN
    FOREACH v_member IN ARRAY v_savings_members LOOP
      PERFORM public.recompute_savings_balances(v_member);
    END LOOP;
  END IF;

  -- Backfill benevolent rows from existing weekly collection entries using
  -- the same mapping as sync_weekly_benevolent().
  SELECT COALESCE(array_agg(DISTINCT wce.member_id), '{}'::uuid[])
    INTO v_benevolent_members
  FROM public.weekly_collection_entries wce
  JOIN public.weekly_collections wc
    ON wc.id = wce.collection_id
  WHERE COALESCE(wce.benevolent_fund, 0) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.benevolent_entries be
      WHERE be.weekly_entry_id = wce.id
    );

  INSERT INTO public.benevolent_entries(
    member_id,
    entry_date,
    transaction_type,
    contribution,
    withdrawal,
    description,
    weekly_entry_id,
    source,
    created_by
  )
  SELECT
    wce.member_id,
    wc.collection_date,
    'contribution',
    COALESCE(wce.benevolent_fund, 0),
    0,
    'Weekly Sheet . Week ' || wc.week_number,
    wce.id,
    'weekly',
    auth.uid()
  FROM public.weekly_collection_entries wce
  JOIN public.weekly_collections wc
    ON wc.id = wce.collection_id
  WHERE COALESCE(wce.benevolent_fund, 0) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.benevolent_entries be
      WHERE be.weekly_entry_id = wce.id
    )
  ON CONFLICT (weekly_entry_id) DO UPDATE SET
    member_id = EXCLUDED.member_id,
    entry_date = EXCLUDED.entry_date,
    contribution = EXCLUDED.contribution,
    description = EXCLUDED.description;

  GET DIAGNOSTICS v_benevolent_count = ROW_COUNT;

  IF array_length(v_benevolent_members, 1) IS NOT NULL THEN
    FOREACH v_member IN ARRAY v_benevolent_members LOOP
      PERFORM public.recompute_benevolent_balances(v_member);
    END LOOP;
  END IF;

  v_count := v_savings_count + v_benevolent_count;
  RETURN v_count;
END;
$$;

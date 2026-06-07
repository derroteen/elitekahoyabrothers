
-- Allow members to read weekly_collections so embedded joins resolve week_number/collection_date
DROP POLICY IF EXISTS "view weekly collections" ON public.weekly_collections;
CREATE POLICY "view weekly collections"
  ON public.weekly_collections FOR SELECT
  TO authenticated
  USING (true);

-- Auto-rebuild balances when an opening balance is created/updated
CREATE OR REPLACE FUNCTION public.opening_balance_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_member uuid;
BEGIN
  v_member := COALESCE(NEW.member_id, OLD.member_id);
  PERFORM public.recompute_passbook_balances(v_member);
  PERFORM public.recompute_savings_balances(v_member);
  PERFORM public.recompute_benevolent_balances(v_member);
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_opening_balance_recompute ON public.member_opening_balances;
CREATE TRIGGER trg_opening_balance_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.member_opening_balances
FOR EACH ROW EXECUTE FUNCTION public.opening_balance_after_change();

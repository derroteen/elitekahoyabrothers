DROP TRIGGER IF EXISTS benevolent_entries_recompute ON public.benevolent_entries;
CREATE TRIGGER benevolent_entries_recompute
  AFTER INSERT OR DELETE ON public.benevolent_entries
  FOR EACH ROW EXECUTE FUNCTION public.benevolent_after_change();
CREATE TRIGGER benevolent_entries_recompute_upd
  AFTER UPDATE OF contribution, withdrawal, entry_date, member_id ON public.benevolent_entries
  FOR EACH ROW EXECUTE FUNCTION public.benevolent_after_change();
-- Remove duplicate/broken auto-post triggers and functions that reference
-- non-existent columns (weekly_entry_id/source/remarks on savings_entries,
-- and amount on benevolent_entries). The same data is already handled by
-- sync_weekly_passbook -> sync_passbook_to_savings and sync_weekly_benevolent.

DROP TRIGGER IF EXISTS auto_post_savings ON public.weekly_collection_entries;
DROP TRIGGER IF EXISTS auto_post_benevolent ON public.weekly_collection_entries;

DROP FUNCTION IF EXISTS public.auto_post_savings_entry();
DROP FUNCTION IF EXISTS public.auto_post_benevolent_entry();
DROP FUNCTION IF EXISTS public.backfill_missing_savings_benevolent();
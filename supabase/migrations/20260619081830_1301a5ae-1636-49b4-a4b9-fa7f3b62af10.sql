
-- Drop redundant duplicate-loan-issued trigger and function
DROP TRIGGER IF EXISTS loan_issued_passbook_trigger ON public.loans;
DROP FUNCTION IF EXISTS public.auto_create_loan_issued_passbook_entry();

-- Temporarily disable sync triggers so cleanup doesn't recurse into recompute
ALTER TABLE public.passbook_entries DISABLE TRIGGER sync_passbook_to_savings_trg;

-- Identify passbook rows to delete
CREATE TEMP TABLE _dup_passbook_ids (id uuid PRIMARY KEY) ON COMMIT DROP;

-- Duplicate "Loan Issued" entries: keep the one linked to loan_id
INSERT INTO _dup_passbook_ids(id)
SELECT p.id
FROM public.passbook_entries p
JOIN public.passbook_entries q
  ON p.id <> q.id
 AND p.member_id = q.member_id
 AND p.entry_date = q.entry_date
WHERE p.description = 'Loan Issued'
  AND q.description = 'Loan Issued'
  AND p.loan_id IS NULL
  AND q.loan_id IS NOT NULL;

-- Duplicate savings entries: prefer weekly_entry_id-linked, then earliest
INSERT INTO _dup_passbook_ids(id)
SELECT id FROM (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY member_id, entry_date, savings
      ORDER BY
        CASE WHEN weekly_entry_id IS NOT NULL THEN 0 ELSE 1 END,
        created_at ASC, id ASC
    ) AS rn
  FROM public.passbook_entries
  WHERE savings > 0
    AND (description IS NULL OR description <> 'Loan Issued')
    AND loan_id IS NULL
    AND opening_loan_id IS NULL
) s
WHERE s.rn > 1
ON CONFLICT DO NOTHING;

-- Delete child savings rows first to avoid FK race with AFTER-DELETE trigger
DELETE FROM public.savings_entries
WHERE passbook_entry_id IN (SELECT id FROM _dup_passbook_ids);

-- Now delete duplicate passbook entries
DELETE FROM public.passbook_entries
WHERE id IN (SELECT id FROM _dup_passbook_ids);

-- Re-enable trigger
ALTER TABLE public.passbook_entries ENABLE TRIGGER sync_passbook_to_savings_trg;

-- Recompute balances for every member
DO $$
DECLARE rec record;
BEGIN
  FOR rec IN SELECT DISTINCT member_id FROM public.passbook_entries LOOP
    PERFORM public.recompute_passbook_balances(rec.member_id);
    PERFORM public.recompute_savings_balances(rec.member_id);
    PERFORM public.recompute_benevolent_balances(rec.member_id);
  END LOOP;
END $$;

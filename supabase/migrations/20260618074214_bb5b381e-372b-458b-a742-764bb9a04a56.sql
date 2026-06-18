
-- Schema additions
ALTER TABLE public.passbook_entries
  ADD COLUMN IF NOT EXISTS loan_debit numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loan_id uuid REFERENCES public.loans(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS opening_loan_id uuid REFERENCES public.loan_opening_balances(id) ON DELETE CASCADE;

ALTER TABLE public.passbook_entries DROP CONSTRAINT IF EXISTS passbook_entries_source_check;
ALTER TABLE public.passbook_entries ADD CONSTRAINT passbook_entries_source_check
  CHECK (source = ANY (ARRAY['manual','weekly','opening','loan','opening_loan']));

CREATE UNIQUE INDEX IF NOT EXISTS passbook_entries_loan_id_key
  ON public.passbook_entries(loan_id) WHERE loan_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS passbook_entries_opening_loan_id_key
  ON public.passbook_entries(opening_loan_id) WHERE opening_loan_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.recompute_passbook_balances(_member uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE rec record; prev_bal numeric := 0; prev_loan numeric := 0;
  v_total numeric; v_bal numeric; v_loan numeric; v_open record;
BEGIN
  SELECT COALESCE(opening_savings,0) AS s INTO v_open
    FROM public.member_opening_balances WHERE member_id = _member;
  IF FOUND THEN prev_bal := v_open.s; END IF;

  FOR rec IN
    SELECT id, savings, bonus, withdrawal, loan_payment, loan_debit
    FROM public.passbook_entries WHERE member_id = _member
    ORDER BY entry_date ASC, created_at ASC, id ASC
  LOOP
    v_total := COALESCE(rec.savings,0) + COALESCE(rec.bonus,0);
    v_bal := prev_bal + v_total - COALESCE(rec.withdrawal,0);
    v_loan := GREATEST(0, prev_loan + COALESCE(rec.loan_debit,0) - COALESCE(rec.loan_payment,0));
    UPDATE public.passbook_entries SET total = v_total, balance = v_bal, loan_balance = v_loan WHERE id = rec.id;
    prev_bal := v_bal; prev_loan := v_loan;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.sync_loan_issued_passbook()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_should boolean := false;
BEGIN
  IF NEW.status IN ('approved','active','overdue','completed','completed_with_fine') THEN
    IF TG_OP = 'INSERT' OR OLD.status IN ('pending','rejected') THEN v_should := true; END IF;
  END IF;
  IF v_should THEN
    INSERT INTO public.passbook_entries(
      member_id, entry_date, savings, bonus, withdrawal, loan_payment, loan_debit,
      total, balance, loan_balance, description, remarks, category, source, loan_id, created_by
    ) VALUES (
      NEW.member_id, NEW.loan_date, 0,0,0,0, COALESCE(NEW.total_repayable,0),
      0,0,0, 'Loan Issued', 'Loan Issued (Principal + Interest)',
      'loan_issued','loan', NEW.id, NEW.created_by
    ) ON CONFLICT (loan_id) WHERE loan_id IS NOT NULL DO NOTHING;
    PERFORM public.recompute_passbook_balances(NEW.member_id);
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS sync_loan_issued_passbook_trg ON public.loans;
CREATE TRIGGER sync_loan_issued_passbook_trg
  AFTER INSERT OR UPDATE OF status ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.sync_loan_issued_passbook();

CREATE OR REPLACE FUNCTION public.sync_opening_loan_passbook()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.passbook_entries WHERE opening_loan_id = OLD.id;
    PERFORM public.recompute_passbook_balances(OLD.member_id);
    RETURN OLD;
  END IF;
  INSERT INTO public.passbook_entries(
    member_id, entry_date, savings, bonus, withdrawal, loan_payment, loan_debit,
    total, balance, loan_balance, description, remarks, category, source, opening_loan_id, created_by
  ) VALUES (
    NEW.member_id, NEW.loan_date, 0,0,0,0,
    COALESCE(NEW.total_repayable, NEW.balance, 0),
    0,0,0, 'Loan Balance Brought Forward', 'Loan Balance Brought Forward',
    'opening_loan','opening_loan', NEW.id, NEW.created_by
  ) ON CONFLICT (opening_loan_id) WHERE opening_loan_id IS NOT NULL DO UPDATE SET
    entry_date = EXCLUDED.entry_date, loan_debit = EXCLUDED.loan_debit;
  PERFORM public.recompute_passbook_balances(NEW.member_id);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS sync_opening_loan_passbook_trg ON public.loan_opening_balances;
CREATE TRIGGER sync_opening_loan_passbook_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.loan_opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.sync_opening_loan_passbook();

CREATE OR REPLACE FUNCTION public.repair_loan_passbook_entries()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_loans int := 0; v_openings int := 0; v_members int := 0; rec record;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: staff only';
  END IF;
  FOR rec IN
    SELECT l.id, l.member_id, l.loan_date, l.total_repayable, l.created_by FROM public.loans l
    WHERE l.status IN ('approved','active','overdue','completed','completed_with_fine')
      AND NOT EXISTS (SELECT 1 FROM public.passbook_entries p WHERE p.loan_id = l.id)
  LOOP
    INSERT INTO public.passbook_entries(member_id, entry_date, savings, bonus, withdrawal, loan_payment, loan_debit,
      total, balance, loan_balance, description, remarks, category, source, loan_id, created_by)
    VALUES (rec.member_id, rec.loan_date, 0,0,0,0, COALESCE(rec.total_repayable,0),
      0,0,0, 'Loan Issued', 'Loan Issued (Principal + Interest)',
      'loan_issued','loan', rec.id, rec.created_by)
    ON CONFLICT (loan_id) WHERE loan_id IS NOT NULL DO NOTHING;
    v_loans := v_loans + 1;
  END LOOP;
  FOR rec IN
    SELECT o.id, o.member_id, o.loan_date, o.total_repayable, o.balance, o.created_by
    FROM public.loan_opening_balances o
    WHERE NOT EXISTS (SELECT 1 FROM public.passbook_entries p WHERE p.opening_loan_id = o.id)
  LOOP
    INSERT INTO public.passbook_entries(member_id, entry_date, savings, bonus, withdrawal, loan_payment, loan_debit,
      total, balance, loan_balance, description, remarks, category, source, opening_loan_id, created_by)
    VALUES (rec.member_id, rec.loan_date, 0,0,0,0,
      COALESCE(rec.total_repayable, rec.balance, 0),
      0,0,0, 'Loan Balance Brought Forward', 'Loan Balance Brought Forward',
      'opening_loan','opening_loan', rec.id, rec.created_by)
    ON CONFLICT (opening_loan_id) WHERE opening_loan_id IS NOT NULL DO NOTHING;
    v_openings := v_openings + 1;
  END LOOP;
  FOR rec IN SELECT DISTINCT member_id FROM public.passbook_entries LOOP
    PERFORM public.recompute_passbook_balances(rec.member_id);
    v_members := v_members + 1;
  END LOOP;
  RETURN jsonb_build_object('loans_backfilled', v_loans,
    'opening_loans_backfilled', v_openings, 'members_recomputed', v_members);
END $function$;

-- One-time inline backfill
DO $$
DECLARE rec record;
BEGIN
  FOR rec IN
    SELECT l.id, l.member_id, l.loan_date, l.total_repayable, l.created_by FROM public.loans l
    WHERE l.status IN ('approved','active','overdue','completed','completed_with_fine')
      AND NOT EXISTS (SELECT 1 FROM public.passbook_entries p WHERE p.loan_id = l.id)
  LOOP
    INSERT INTO public.passbook_entries(member_id, entry_date, savings, bonus, withdrawal, loan_payment, loan_debit,
      total, balance, loan_balance, description, remarks, category, source, loan_id, created_by)
    VALUES (rec.member_id, rec.loan_date, 0,0,0,0, COALESCE(rec.total_repayable,0),
      0,0,0, 'Loan Issued', 'Loan Issued (Principal + Interest)',
      'loan_issued','loan', rec.id, rec.created_by)
    ON CONFLICT (loan_id) WHERE loan_id IS NOT NULL DO NOTHING;
  END LOOP;
  FOR rec IN
    SELECT o.id, o.member_id, o.loan_date, o.total_repayable, o.balance, o.created_by
    FROM public.loan_opening_balances o
    WHERE NOT EXISTS (SELECT 1 FROM public.passbook_entries p WHERE p.opening_loan_id = o.id)
  LOOP
    INSERT INTO public.passbook_entries(member_id, entry_date, savings, bonus, withdrawal, loan_payment, loan_debit,
      total, balance, loan_balance, description, remarks, category, source, opening_loan_id, created_by)
    VALUES (rec.member_id, rec.loan_date, 0,0,0,0,
      COALESCE(rec.total_repayable, rec.balance, 0),
      0,0,0, 'Loan Balance Brought Forward', 'Loan Balance Brought Forward',
      'opening_loan','opening_loan', rec.id, rec.created_by)
    ON CONFLICT (opening_loan_id) WHERE opening_loan_id IS NOT NULL DO NOTHING;
  END LOOP;
  FOR rec IN SELECT DISTINCT member_id FROM public.passbook_entries LOOP
    PERFORM public.recompute_passbook_balances(rec.member_id);
  END LOOP;
END $$;

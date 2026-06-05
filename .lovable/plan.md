# Opening Balances ("Brought Forward")

## 1. Database

New table `public.member_opening_balances` (one row per member):

- `member_id` (uuid, PK, FK → profiles.id)
- `effective_date` (date, default today)
- `opening_savings`, `opening_loan`, `opening_fine`, `opening_insurance`, `opening_benevolent` (numeric(14,2), default 0)
- `notes` (text)
- `created_by`, `updated_by`, `created_at`, `updated_at`

Standard four-step migration (CREATE → GRANT → RLS → POLICY). Policies:
- `authenticated` SELECT where `member_id = auth.uid()` OR `is_staff(auth.uid())` OR `has_role(auth.uid(), 'auditor')`
- INSERT/UPDATE/DELETE only when `is_staff(auth.uid())` (Super Admin + Admin)
- Attach existing `audit_trigger()` so every change is recorded in `audit_logs`
- `touch_updated_at` trigger

(Benevolent fund has no existing transactions table — we only track its opening balance for now; future contributions can extend later.)

## 2. Server functions (`src/lib/opening-balances.functions.ts`)

All protected by `requireSupabaseAuth` + staff check:

- `listOpeningBalances()` — joins profiles, returns members with their B/F row (or zeros) — staff/auditor only
- `getMyOpeningBalance()` — current user's row — any authenticated user
- `upsertOpeningBalance({ member_id, effective_date, opening_*, notes })` — staff only
- `bulkImportOpeningBalances({ rows })` — staff only; validates each row (membership_no exists, numbers ≥ 0, valid date), returns `{ inserted, updated, errors[] }`

## 3. UI

New page `src/routes/_authenticated/opening-balances.tsx` (Super Admin + Admin only, gated by `role` check + redirect):

- Table of all members with their current B/F values (editable inline via dialog)
- "Edit" dialog: all opening fields + effective date + notes
- "Bulk import" dialog: paste-from-Excel textarea (TSV) or upload `.csv`/`.xlsx`. Preview validated rows, then commit. Uses `xlsx` (already widely supported) — install if missing.
- Add nav item "Opening Balances" in `src/routes/_authenticated.tsx` for `super_admin` and `admin` only.

## 4. Passbook integration

Modify `src/components/PassbookTable.tsx` (and `passbook.tsx` / `my-passbook.tsx` loaders):

- Prepend a synthetic first row when an opening balance row exists for the member:
  - Date: `effective_date`
  - Description: **"Brought Forward Balance"**
  - Savings / Loan / Fine / Insurance columns populated from opening row
  - Visually distinct (bold + gold accent)
- Running balances downstream start from those opening numbers.

## 5. Member dashboard (`src/routes/_authenticated/index.tsx`)

For the `member` view, add a "Brought Forward Balances" card with five rows (Savings, Loan, Fine, Insurance, Benevolent), shown above current-period totals. Hidden when all zeros.

## 6. Reports (`src/routes/_authenticated/reports.tsx` + `src/lib/exports.ts`)

- Member Statement, Passbook, Loan Report, Savings Report, Auditor Report each load opening balances and:
  - Show a "Brought Forward" row/section at the top
  - Include opening values in totals and running balances
- PDF and Excel exports include the same B/F row as the first line.

## 7. Audit trail

`audit_trigger()` on `member_opening_balances` records actor, op, old/new JSON in existing `audit_logs` table — already surfaced on `/audit` page, no UI work needed.

## 8. Calculations

Wherever current balances are computed, replace `sum(entries)` with `opening + sum(entries)`:
- Savings: `opening_savings + Σ savings_entries.amount`
- Loan: `opening_loan + Σ new principal + interest + fines − repayments` (additive to existing `loans` rollups; treat opening as a virtual loan-balance baseline shown on dashboard/passbook only — do NOT mutate `loans.balance` to avoid corrupting per-loan accounting)
- Fines: `opening_fine + Σ unpaid fines − fine payments`
- Insurance: `opening_insurance + Σ insurance entries` (insurance currently tracked via savings/passbook entry types — handled in passbook running totals)

## Technical notes

- Table: `public.member_opening_balances` with grants to `authenticated` (SELECT/INSERT/UPDATE/DELETE) and `service_role` (ALL).
- Audit via existing `public.audit_trigger()`.
- Bulk import: add `xlsx` package for parsing `.xlsx`; CSV path uses native parsing.
- Member dropdowns continue to use existing `filterMembersOnly` helper so admins/auditors/super-admins are excluded from member-only views.
- No changes to `loans.balance` schema — opening loan balance is a display-layer baseline, surfaced in passbook/dashboard/reports.

## Out of scope

- Editing historical (pre-website) loan repayment schedules row-by-row — only the aggregate opening loan balance is captured.
- Benevolent fund transaction tracking beyond the opening balance (can be added in a follow-up).

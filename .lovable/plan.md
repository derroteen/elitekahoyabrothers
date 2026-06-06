# Weekly Expenditures Module

## 1. Database (migration)

New table `public.weekly_expenditures`:
- `id` uuid PK
- `expenditure_date` date NOT NULL
- `week_number` int (ISO week of `expenditure_date`)
- `year` int
- `particulars` text NOT NULL
- `amount` numeric(14,2) NOT NULL CHECK (amount >= 0)
- `quantity` numeric(10,2) NULL
- `notes` text NULL
- `recorded_by` uuid REFERENCES auth.users
- `created_at`, `updated_at` timestamptz

GRANTs: SELECT/INSERT/UPDATE/DELETE to `authenticated`; ALL to `service_role`.

RLS policies:
- SELECT: `is_staff(auth.uid())` OR `has_role(auth.uid(),'auditor')` OR `has_role(auth.uid(),'member')` (members view only; granted via select policy).
- INSERT/UPDATE/DELETE: `is_staff(auth.uid())` only (super_admin + admin).

Triggers:
- `touch_updated_at` BEFORE UPDATE.
- `audit_trigger` AFTER INSERT/UPDATE/DELETE → writes to `audit_logs`.
- BEFORE INSERT/UPDATE: auto-fill `week_number = EXTRACT(week FROM expenditure_date)`, `year = EXTRACT(isoyear FROM expenditure_date)`.

## 2. Navigation

Edit `src/routes/_authenticated.tsx`:
- Insert `{ to: "/weekly-expenditures", label: "Weekly Expenditures", icon: Receipt }` in `super_admin`, `admin`, and `member` NAV arrays, positioned after Savings and before Announcements/Reports (members: only if visible — keep simple, show to all roles in NAV, read-only enforced by RLS + UI).

## 3. Route page

New `src/routes/_authenticated/weekly-expenditures.tsx`:
- Filters: Week #, Month, Year, Date range (from/to).
- Table cols: Date · Particulars · Cash Paid · Quantity · Recorded By · Date Recorded.
- Footer row: Total Weekly Expenditure.
- "Add Expenditure" button (staff only) → dialog form (Date, Particulars, Amount, Quantity, Notes; Save/Cancel).
- Edit/Delete row actions (staff only).
- Weekly Financial Summary card (when a single week is selected):
  - Total Collections (sum of `weekly_collection_entries` for that week's collection)
  - Total Expenditures
  - Net Weekly Position = Collections − Expenditures
  - (Cash Banked / Cash in Hand shown if fields exist; otherwise omitted with a note — current schema has no cash_banked field, will display Collections, Expenditures, Net only.)
- Export buttons: PDF (jsPDF), Excel (xlsx), CSV. Reuse patterns from `src/lib/exports.ts`/`passbook-export.ts`.
- Mobile: horizontal-scroll wrapper around table, stacked filter controls, full-width dialog.

## 4. Dashboard cards

Edit `src/routes/_authenticated/dashboard.tsx`:
- Staff query: also fetch sum of expenditures for current ISO week and current month.
- Add two StatCards: "Weekly Expenditure" and "Monthly Expenditure".

## 5. Audit

Handled by `audit_trigger` on the new table — no app code needed.

## Technical notes

- Reuse existing `fmtKES`, `fmtDate`, `Dialog`, `Input`, `Button`, `Table` components.
- Mutations use `supabase.from('weekly_expenditures')` directly (RLS enforces staff-only writes).
- React Query keys: `['weekly-expenditures', filters]`, invalidate on mutation.
- Cash Banked / Cash in Hand not in schema — surface Collections, Expenditures, and Net only; mention in UI that banking fields can be added later if needed.

Confirm and I'll implement.


# Elite Kahoya Brothers (EKB) Management System — Build Plan

I'll convert your HTML prototype into a production React + Lovable Cloud (Supabase) app, **preserving the navy/gold design language, Playfair/DM Sans/IBM Plex Mono typography, sidebar layout, passbook table styling, and color tokens** from your prototype.

This is a large scope — I'll deliver it in 3 phases so you can review between each phase.

---

## Phase 1 — Foundation (this turn)

**Design system & layout**
- Port the prototype's tokens (navy `#0A1628`, gold `#C9A84C`, blue accents, blue-light passbook rows) into `src/styles.css` as semantic tokens.
- Load Playfair Display, DM Sans, IBM Plex Mono.
- Build the sidebar shell, topbar, cards, stat-cards, buttons, badges, passbook table styles as reusable React components.

**Backend (Lovable Cloud / Supabase)**
- Enable Lovable Cloud.
- Database schema:
  - `profiles` (id → auth.users, full_name, email, phone, membership_no like `EKB001`, must_change_password, date_joined)
  - `user_roles` (separate table, enum: `super_admin | admin | auditor | member`) + `has_role()` security-definer function
  - `passbook_entries` (date, savings, bonus, total, withdrawal, balance, loan_payment, loan_balance, treasurer_sign, remarks, member_id)
  - `loans` (date, amount_borrowed, interest_rate, payment_frequency, amount_paid, balance, insurance, status)
  - `loan_repayments`
  - `savings_entries` (amount, bonus, total, withdrawal, balance)
  - `announcements` (title, body, pinned, created_by)
  - `notifications` (user_id, type, payload, read)
  - `audit_logs` (actor, action, table, record_id, old_value, new_value, timestamp)
- RLS policies on every table — members see only their own data; admins/super_admins write; auditors read all.
- Auto-grant `member` role on signup via trigger; sequential `EKB001` numbering via trigger.
- Seed the **Super Admin** (`superadmin` / `admin1234`, `must_change_password=true`).

**Auth**
- Email/password sign-in (username `superadmin` mapped to a synthetic email like `superadmin@ekb.local`).
- Force password change on first login → `/change-password` route.
- Password reset flow + `/reset-password` page.
- `_authenticated` route guard + role-based child guards (`_admin`, `_auditor`).

---

## Phase 2 — Core modules

- **Passbook**: list view (matching your prototype's navy header + blue-light striped rows), member-scoped read, admin add/edit/delete with auto-calculated `total`, `balance`, `loan_balance`.
- **Loans module**: applications, approvals, repayments, interest & penalty calc, status tracking.
- **Savings module**: deposits, bonuses, withdrawals, running balance.
- **Members**: admin CRUD, auto-issue membership numbers, email temp password.
- **Announcements**: CRUD + pin, displayed on dashboards.
- **Notifications**: in-app + email (via Lovable Emails) for new account, password reset, new announcement, loan approval, repayment reminder.

---

## Phase 3 — Dashboards, exports, audit

- **Dashboards** for Member / Admin / Auditor (matching prototype stat-grid).
- **Audit logs** via DB triggers on financial tables.
- **Exports**: PDF (passbook, reports) via `jspdf` + `jspdf-autotable`; Excel via `xlsx` with formulas.
- **Settings**: change password, profile.
- Sample data seed for 15 members.

---

## Technical notes

- Stack: TanStack Start (existing template) + React + Tailwind + Lovable Cloud.
- All financial mutations write an `audit_logs` row via DB trigger so auditors get a complete history without app-layer coupling.
- Email via Lovable Emails (will prompt for domain setup when we wire notifications in Phase 2).
- No SMS now; notifications table has a `channel` column so SMS can be added later without migration.

Reply **"go"** to start Phase 1, or tell me what to adjust (scope, order, naming) first.

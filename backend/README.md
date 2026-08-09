# HR System — multi-company backend

A Node.js/Express API + minimal web UI providing real, server-enforced
multi-tenancy on top of the standalone payroll app in `../index.html`:

- **Companies** — one account can own or be invited into several companies;
  every record (employee, contractor, branch, user role) is scoped by
  `company_id` and every query is filtered by it, so one company's data
  cannot leak into another's, even for a user who legitimately belongs to
  both.
- **Users & per-company roles** — `owner`, `admin`, `hr`, `finance`,
  `viewer` (see `src/permissions.js`). Roles are assigned per company, so
  the same person can be an owner of one company and have no access at all
  to another.
- **Platform super admin** — a system-owner role above per-company roles
  (`users.is_super_admin`). Emails listed in `SUPER_ADMIN_EMAILS` are
  auto-promoted on register/login. A super admin gets a "🛡️ إدارة النظام /
  Platform Admin" page listing every company in the system (owners, user
  count, employee count), can create new companies from inside the app,
  and can grant or revoke any external user's access to any specific
  company (`/api/admin/...`, `src/routes/admin.js`) without being a
  member of it.
- **Employees** — the regular payroll headcount.
- **Contractors** — a separate module for outsourced/temporary labor under
  individual contracts (daily/monthly/project/hourly), kept out of the
  regular employee table.
- **Branches**.
- **Payroll runs** — one run per month/year, with a line per employee
  (basic/housing/transport/other/overtime/bonus, absence days, deductions).
  Gross/net pay is computed server-side in `src/payrollCalc.js` (ported
  from the original app's `calcEmp`) and stored as a snapshot per line, so
  a later salary change never rewrites payroll history.
- **Advances & settlements** — cash advances with monthly deduction plans;
  status (pending/partial/settled) is derived from the sum of recorded
  settlements, never stored redundantly.
- **End-of-service gratuity (EOS)** — KSA Labor Law Art. 84 (resignation)
  / Art. 87 (termination) calculation, ported from the original app's
  `calcKsaEos`. The client only picks who and why; the gratuity figure is
  always computed server-side from the employee's real hire date and
  salary — it cannot be submitted directly. **Note:** these article
  numbers need re-verification — the Executive Regulations reference the
  resignation-entitlement rule as Article 75, not 84; see the note near
  the bottom of this file.
- **Leaves** (`src/leaveCalc.js`, `src/routes/leaves.js`) — per KSA Labor
  Law Executive Regulations Art. 33-44: annual leave accrues at 21 days/
  year (30 after 5 continuous years of service), prorated across the
  current service-year and validated against the accrued balance before a
  request is accepted; sick leave auto-splits into the statutory pay tiers
  (30 days full pay / 60 days at ¾ pay / 30 days unpaid, tracked over a
  rolling 365-day window from each employee's sick-leave history); the
  fixed-duration occasion leaves (marriage 5d, birth 3d, death 5d, Hajj
  10d with a 5-year gap and 2-year service minimum, iddah 130d Muslim /
  15d non-Muslim) are capped at their statutory maximum. Exam and unpaid
  leave have no system-enforced cap. Every calculation happens
  server-side (`src/leaveCalc.js`), with a live preview shown in the UI
  before submission.

This is a genuinely secure design (passwords hashed with bcrypt, JWT auth,
every write/read checked server-side against the caller's role for that
specific company) — unlike the original single-file app, which keeps
everything in the browser's `localStorage` with no access control at all.

## Quick start (SQLite, zero config)

```bash
cd backend
npm install
cp .env.example .env
# Fill in JWT_SECRET in .env, e.g.:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

npm run migrate
npm start
```

Open `http://localhost:4000`. The API is under `/api`, and `public/index.html`
is served as a small web UI (register a company, log in, manage employees /
contractors / branches / users).

The SQLite database is a single file at `data/hrsystem.sqlite3` (created
automatically). This only works if the host running the server has a
**persistent disk** — most serverless/free-tier PaaS platforms wipe the
filesystem on redeploy, which would silently reset your data.

## Switching to PostgreSQL

Set in `.env`:

```
DB_CLIENT=pg
DATABASE_URL=postgres://user:password@host:5432/hrsystem
```

Then `npm run migrate && npm start` — no code changes needed. The schema
and all queries are written through Knex's dialect-agnostic query builder,
so the same migrations and API run unchanged against either database.

## API shape

```
POST   /api/auth/register        create a company + its first (owner) user
POST   /api/auth/login
GET    /api/auth/me              current user + their companies/roles

GET    /api/companies            companies the caller belongs to
POST   /api/companies            create another company (caller becomes owner)
GET    /api/companies/:id
PATCH  /api/companies/:id

GET    /api/companies/:id/users
POST   /api/companies/:id/users        add/invite a user with a role (owner only)
PATCH  /api/companies/:id/users/:uid   change a user's role (owner only)
DELETE /api/companies/:id/users/:uid   remove a user's access (owner only)

GET|POST    /api/companies/:id/employees
GET|PATCH|DELETE /api/companies/:id/employees/:eid

GET|POST    /api/companies/:id/contractors
GET|PATCH|DELETE /api/companies/:id/contractors/:cid

GET|POST    /api/companies/:id/branches
PATCH|DELETE /api/companies/:id/branches/:bid

GET|POST    /api/companies/:id/payroll-runs
GET|PATCH|DELETE /api/companies/:id/payroll-runs/:runId
POST        /api/companies/:id/payroll-runs/:runId/generate   pull in every active employee as a line
PATCH|DELETE /api/companies/:id/payroll-runs/:runId/lines/:lineId

GET|POST    /api/companies/:id/advances
GET|DELETE  /api/companies/:id/advances/:advId
POST        /api/companies/:id/advances/:advId/settlements

GET         /api/companies/:id/settlements        (flat list across all advances)
DELETE      /api/companies/:id/settlements/:setlId

GET|POST    /api/companies/:id/eos
PATCH|DELETE /api/companies/:id/eos/:eosId         (status: Pending → Approved → Paid)

GET         /api/companies/:id/employees/export/xlsx
POST        /api/companies/:id/employees/import/parse    preview only, writes nothing
POST        /api/companies/:id/employees/import/commit   bulk-creates the reviewed rows
GET         /api/companies/:id/payroll-runs/:runId/export/xlsx
```

Every `/api/companies/:id/...` route requires the caller to hold a role in
that company; write routes additionally require a role permitted for that
action (see `src/permissions.js`). Attempting to touch a company you're not
a member of returns `403`, not the other company's data.

## What's covered vs. what's still in the legacy single-file app

This backend now covers company/user/role management (with a dedicated
Company Settings screen — name, logo, configurable approval signatures),
employees (full identity/personal/employment/salary field set — ID type &
expiry, iqama, passport, nationality, gender, DOB, cost center, branch
link, GOSI employee/employer %/amounts, health insurance, income tax,
fixed monthly deductions, file attachments, bank/IBAN/SWIFT, etc.),
contractors, branches, payroll runs (with printable bilingual salary
slips *and* a full payroll summary sheet with signatures — both pull the
company's configured signatures/logo), advances/settlements, end-of-service
gratuity, an org chart view, and a KPI dashboard — all company-scoped with
real server-side permission checks. "Add/edit" screens are modal popups
(matching the original's UI pattern) rather than permanently-inline forms.
The web UI is labeled bilingually (Arabic/English) throughout. The Gregorian
→ Hijri year on payroll runs auto-fills via the browser's built-in Islamic
calendar. Employees can be exported to / imported from `.xlsx` (preview
before commit), and every printable report (payroll slip, payroll summary)
opens with its own Print and Export-to-Excel toolbar rather than relying
only on an auto-print timer.

Note on the Excel library: the original app loaded SheetJS from a CDN,
but the npm-published `xlsx` package has known unpatched high-severity
vulnerabilities (prototype pollution, ReDoS — both directly triggerable
by a malicious uploaded file, exactly our attack surface). This backend
uses `exceljs` instead, which has no such issue.

A Compliance Report page mirrors the original: gross/deductions/net/
employer-GOSI/total-employment-cost/statutory KPI cards, an IAS 19/IFRS
reconciliation line, and a cost-by-department table, computed per payroll
run and printable. The Payroll page also has a searchable Archive (every
run persists automatically — no manual "save" step needed, since this is
a real database, not `localStorage`) with view/print/delete per run.

Company Settings also covers theme (6 color presets, applied live and
persisted per company) and print settings (show/hide logo, custom
header/footer text applied to every printed document). New employees'
Employee No. auto-generates (`EMP-001`, `EMP-002`, ...) instead of being
typed manually.

**Bug fix:** `logo_data_url` (and a few other now-large-content columns)
were declared as default string columns, which map to `VARCHAR(255)` on
PostgreSQL. SQLite doesn't enforce that length, so local/dev testing never
caught it, but Postgres does — every logo upload against the real deployed
database failed. Fixed by widening the column to unlimited text
(migration `20240107000000_fix_logo_column_length.js`); verified against
a real Postgres instance, not just SQLite.

The payroll slip print now uses the exact same markup/CSS classes as the
original app's `buildSlipHtml` (`.slip`, `.slip-hdr`, `.slip-info-row`,
`.slip-body`/`.slip-sec`, `.slip-totals`, `.slip-footer`, etc., themed
from the company's selected color preset) rather than an approximation,
and payroll lines now snapshot empno/idno/cost-center alongside
name/department — shown on both the payroll table and the slip/summary
prints. The EOS reason dropdown covers all six original options
(termination, contract end, resignation, mutual agreement, death,
disability) instead of just two; the calculation logic already handled
all six identically to the original (Art. 84 for resignation, Art. 87
for everything else) — only the UI was missing the extra options.

The payroll table, print summary, and Excel export now show every column
the original working set had per employee: present/absent days, basic/
housing/transport/other, due salary (post-absence, pre-overtime), gross,
advance/other deductions, total deductions, net pay, payment method, and
notes — not just the calculated totals. A "🔄 تحديث بيانات الموظفين /
Refresh Employee Data" button on the Payroll page backfills empno/idno/
department/cost-center on an existing run's lines from the current
employee records (for runs generated before those fields existed, or
after editing an employee's registry details) without touching any
payroll-specific numbers already entered for that run.

The payroll summary print now has a "⚙️ أعمدة الطباعة / Print Columns"
picker (which columns show, saved per-browser), aligns each column's own
total directly beneath it (instead of only gross/deductions/net), groups
rows by branch/cost center with each branch on its own printed page and
its own subtotal row plus an overall grand total, and auto-shrinks the
font to keep every visible column on one A4-landscape sheet width.

The Employees, Contractors, Branches, Users, and Payroll-lines tables all
have a search/filter box and click-to-sort column headers (ascending/
descending), so records can be ordered by employee number, name,
department, etc. instead of only insertion order; the payroll table's `#`
header resets to the default name-sequence order.

A "🖨️ طباعة الكل / Print All" button on the Payroll page prints every
employee's payroll slip in one document (one slip per page, page breaks
between them), reusing the exact same slip markup as the single-employee
print button — both now share one `buildPayrollSlipHtml` builder so the
formats can never drift apart.

The End of Service page now has the full **EOS Accruals Register** from
the original app, not just the final-gratuity calculator: a Monthly
Accrual / Yearly Summary / Full Detail / Transactions Log view selector,
month/year/branch/status filters, KSA Art. 84/87 policy reference box, a
live calculator preview (computed instantly in the browser, ported from
the original's `calcServiceDuration`/`calcKsaEos`/`calcMonthlyAccrual` —
the figure that actually gets *saved* is always independently recomputed
and verified server-side), a "💾 Snapshot" button that records every
active employee's current accrued liability in one shot
(`POST /eos/snapshot`), a Print Register button, an Excel export
(`GET /eos/export/xlsx`), and a "Clear All" for the saved-records list
(`DELETE /eos`). This is the running IAS 19-style provisioning ledger,
distinct from (and in addition to) the final gratuity-at-termination
calculator that was already there.

The app is now tablet-responsive: below 980px wide the sidebar becomes an
off-canvas panel opened with a hamburger button (auto-closes after picking
a page), two-column layouts (KSA policy box, EOS calculator, print-column
picker) stack to one column, and modals/tables were checked to confirm
neither introduces horizontal page overflow at common tablet widths
(iPad portrait/landscape, Android tablet).

A "🖊️ كشف استلام نقدي / Cash Receipt Sheet" button on the Payroll page
prints an acknowledgment sheet listing only the run's Cash-paid employees
(Transfer-paid employees excluded), each with their net pay, a signature
line, and a date line, plus a total row — for physically collecting
signed proof of cash salary receipt.

A new "🏖️ الإجازات / Leaves" page covers annual, sick, and the fixed-
duration occasion leave types (see above) — a request form with a live
balance/cap preview, and an approve/reject/delete table for HR.

The employee "Nationality" field is now a searchable list (158 countries,
Arabic name stored / English shown as a hint) via a native `<datalist>`
instead of free text — still just a text input under the hood, so it
degrades gracefully and doesn't block typing something not on the list.

The Compliance Report now breaks cost down by branch/cost center (📍
التكلفة حسب الفرع) as well as by department, both on-screen and in the
printed report — grouped by the payroll line's `cc` snapshot the same
way the payroll summary print groups its per-branch pages.

**Pending: EOS article-number verification.** The uploaded Executive
Regulations PDF (اللائحة التنفيذية) doesn't contain the EOS gratuity
formula itself — that lives in the base نظام العمل (Labor Law), which
wasn't part of that upload. It does show that Article 57 of the
regulations now cites **Article 75** for resignation-based EOS
entitlement, where this app currently labels the same rule "Article 84"
throughout (`src/payrollCalc.js`, EOS pages/prints). The user is sending
the base Labor Law text directly to confirm the current article numbers
(and reconfirm the ⅓/⅔/full and half-month/full-month percentages are
unchanged) before anything gets relabeled or recalculated — don't change
these citations without that source.

Still only in `../index.html` (single-company, `localStorage`-based):
backup/restore.

## Deployment

Needs a host that runs a persistent Node.js process (not a one-shot
function). Two proven options:

- **VPS** (a plain Linux box — DigitalOcean, Hetzner, a regional KSA
  provider, your own server): install Node, `npm ci --omit=dev`, run
  `npm run migrate`, then run `npm start` under a process manager
  (systemd or pm2) behind a reverse proxy (nginx/Caddy) for HTTPS. Works
  with either SQLite or Postgres.
- **PaaS with a persistent volume** (Railway, Render's paid disk tier,
  Fly.io volumes): attach a volume for `data/` if using SQLite, or point
  `DATABASE_URL` at a managed Postgres instance if using Postgres.

Avoid plain serverless/functions hosting (Vercel-style, free-tier Render)
unless paired with an external managed Postgres — their filesystem does not
persist between invocations, which breaks SQLite.

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
  salary — it cannot be submitted directly.

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

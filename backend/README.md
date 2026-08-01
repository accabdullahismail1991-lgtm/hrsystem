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
```

Every `/api/companies/:id/...` route requires the caller to hold a role in
that company; write routes additionally require a role permitted for that
action (see `src/permissions.js`). Attempting to touch a company you're not
a member of returns `403`, not the other company's data.

## What's covered vs. what's still in the legacy single-file app

This backend now covers company/user/role management, employees (full
identity/personal/employment/salary field set — ID type & expiry, iqama,
passport, nationality, gender, DOB, cost center, branch link, bank/IBAN,
etc.), contractors, branches, payroll runs (with printable bilingual salary
slips), advances/settlements, end-of-service gratuity, an org chart view,
and a KPI dashboard — all company-scoped with real server-side permission
checks, and the web UI labeled bilingually (Arabic/English) throughout,
matching the original app's presentation.

Still only in `../index.html` (single-company, `localStorage`-based):
bulk/all-employees payroll printing in one document, company branding
(logo/signatures) on printed documents, and the print-settings/theme
customization screen. These are incremental additions to the payroll-run
and company-settings data this API already exposes.

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

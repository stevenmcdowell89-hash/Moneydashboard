# Budget & Scenario Planner

A private, single-user budgeting, forecasting and scenario-modelling app running
entirely on Cloudflare.

- **Frontend** (`web/`) — React + Vite SPA. All forecast/engine logic runs
  client-side. Deployed to Cloudflare Pages.
- **Worker** (`worker/`) — Cloudflare Worker providing **auth + persistence +
  open-banking proxy ONLY** (no forecast logic). Backed by a D1 database bound as
  `env.DB`. Deployed as a standalone Worker.

Access control is provided by **Cloudflare Access** sitting in front of both the
Pages site and the Worker; the Worker independently validates the Access JWT on
every request.

---

## Architecture at a glance

```
Browser ──► Cloudflare Access ──► Pages (web/dist, the SPA)
                              └──► Worker (/api/*)  ──► D1 (budget_planner)
                                                    └─► GoCardless (open banking)
```

The Worker exposes a small JSON API consumed by `web/src/api/client.ts`:

| Route                                   | Method      | Purpose                                  |
| --------------------------------------- | ----------- | ---------------------------------------- |
| `/api/state`                            | GET / PUT   | Whole plan document (load / replace)     |
| `/api/snapshots`                        | GET / POST  | List / create point-in-time snapshots    |
| `/api/snapshots/:id`                    | DELETE      | Delete a snapshot                        |
| `/api/actuals?period=YYYY-MM`           | GET / PUT   | Read / replace actuals for a month       |
| `/api/tax-config[?tax_year=YYYY/YY]`    | GET / PUT   | Read / upsert tax configuration          |
| `/api/ob/institutions?country=GB`       | GET         | List banks (GoCardless)                  |
| `/api/ob/connect`                       | POST        | Create a consent requisition             |
| `/api/ob/accounts?requisition=ID`       | GET         | Accounts behind a requisition            |
| `/api/ob/transactions?account=ID`       | GET         | Normalised transactions for an account   |

Every `/api/*` request must carry a valid Cloudflare Access JWT
(`Cf-Access-Jwt-Assertion` header, or the `CF_Authorization` cookie). Otherwise
the Worker responds `401`.

---

## Prerequisites

- Node 18+ and npm
- A Cloudflare account with Wrangler authenticated: `npx wrangler login`
- (Optional) GoCardless Bank Account Data credentials for open banking

Install dependencies from the repo root (npm workspaces):

```bash
npm install
```

---

## 1. Create the D1 database

```bash
npx wrangler d1 create budget_planner
```

Copy the returned `database_id` into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "budget_planner"
database_id = "PASTE_THE_RETURNED_ID_HERE"
migrations_dir = "migrations"
```

Apply the schema (local for dev, remote for production):

```bash
# local (used by `wrangler dev`)
npx wrangler d1 migrations apply budget_planner --local

# remote (production D1)
npx wrangler d1 migrations apply budget_planner --remote
```

> Convenience scripts also exist:
> `npm run db:migrate:local` and `npm run db:migrate:remote`.

---

## 2. Local development

Run the Worker and the SPA in two terminals. The Vite dev server already proxies
`/api` to the Worker on `http://localhost:8787` (see `web/vite.config.ts`).

```bash
# terminal 1 — Worker on :8787 (uses the --local D1)
npm run dev:worker        # = wrangler dev

# terminal 2 — SPA on :5173 with /api proxied to the Worker
npm run dev:web           # = vite
```

Open the Vite URL (printed in terminal 2). Requests to `/api/*` are proxied to
the Worker.

### Bypassing Access in local dev

Locally there is no Cloudflare Access in front of you, so no JWT is injected.
The Worker rejects unauthenticated requests **unless** you opt into a dev bypass:

1. Leave `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` as their placeholder values.
2. Set `DEV_BYPASS_AUTH = "true"`.

The bypass is honoured **only** while those two Access vars are still
placeholders, so it can never silently weaken production. Prefer putting it in a
gitignored `.dev.vars` file at the repo root:

```
# .dev.vars  (do NOT commit)
DEV_BYPASS_AUTH = "true"
```

---

## 3. Cloudflare Access setup

Create a **self-hosted Access application** that covers BOTH the Pages site and
the Worker (so the same JWT protects the SPA and its API). In the Cloudflare
dashboard: **Zero Trust → Access → Applications → Add an application →
Self-hosted**.

1. **Application domain(s)** — add the hostname(s) serving the SPA and the
   Worker. If the Worker is on a separate route/subdomain, add it too (or include
   the `/api` path), so Access injects the JWT on API calls.
2. **Policies** — add a policy that allows only you, e.g. an **Allow** policy
   with an `Emails` rule listing your address. (A service-token policy can be
   added for non-interactive clients if needed.)
3. After saving, open the application's **Overview** and copy the
   **Application Audience (AUD) Tag**.
4. Find your **team domain** under **Zero Trust → Settings → Custom Pages /
   General** — it looks like `your-team.cloudflareaccess.com`.

Put both values into `wrangler.toml` `[vars]`:

```toml
[vars]
CF_ACCESS_TEAM_DOMAIN = "your-team.cloudflareaccess.com"
CF_ACCESS_AUD = "your_access_application_aud_tag"
```

The Worker fetches the team's signing keys from
`https://<team>/cdn-cgi/access/certs`, verifies the RS256 signature, and checks
`aud`, `iss` and `exp`.

---

## 4. Worker secrets (open banking)

Open banking uses the GoCardless Bank Account Data API. The credentials are
**Worker secrets** (never committed). If they are unset, the `/api/ob/*` routes
respond `503 GoCardless not configured` — the module is wired but inert.

```bash
npx wrangler secret put GOCARDLESS_SECRET_ID
npx wrangler secret put GOCARDLESS_SECRET_KEY
```

Get the credentials from the GoCardless Bank Account Data portal
(<https://bankaccountdata.gocardless.com/>). Note the free-tier constraints:

- A consent (requisition) is valid for **90 days**, then must be renewed.
- Transaction pulls per account are rate-limited to roughly **4 requests/day** —
  cache results / take snapshots rather than polling.

> The open-banking module is wired but **unverified without live credentials**.

---

## 5. Deploy

Deploy the Worker:

```bash
npm run deploy:worker        # = wrangler deploy
```

Build and deploy the SPA to Pages:

```bash
npm run build                # = vite build  (outputs web/dist)
npx wrangler pages deploy web/dist --project-name budget-planner
# or: npm run deploy:pages
```

Make sure your Access application (step 3) covers the deployed Pages and Worker
hostnames so the JWT is present on every `/api/*` request.

---

## Data model notes

- The plan document (`/api/state`) is the single source of truth held in the
  browser. On `PUT`, the Worker wipes and re-inserts all eight plan tables in one
  D1 `batch()` (an implicit transaction). Client row **ids are preserved exactly**
  — including negative temporary ids — so `scenario_overrides` / `events`
  references stay intact across a save. See the comment in
  `worker/src/db.ts` for the full rationale.
- SQLite integer booleans (`active`, `ring_fenced`) are normalised to real JS
  booleans on read to match `web/src/types.ts`.
- `tax_config.bands` / `ni_thresholds` / `ni_rates` are stored as JSON text and
  parsed into objects on `GET` (stringified on `PUT`).

## Project layout

```
web/                 React + Vite SPA (engine + UI)
worker/
  src/index.ts       Worker entry, router, shared types
  src/auth.ts        Cloudflare Access JWT verification
  src/db.ts          D1 persistence helpers
  src/openbanking.ts GoCardless proxy
migrations/          D1 schema (0001_init.sql)
wrangler.toml        Worker + D1 + Access vars
```

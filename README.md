# Budget & Scenario Planner

A private, single-user budgeting, forecasting and scenario-modelling app that runs
**entirely on Cloudflare as one Worker** — the Worker serves the React app *and*
the JSON API from a single URL, backed by a D1 database. No separate Pages
project, no servers, no GitHub Actions: Cloudflare builds and deploys it straight
from this Git repo.

- **App** (`web/`) — React + Vite SPA. **All** forecast/scenario/pay-engine logic
  runs client-side (`web/src/engine/`).
- **Worker** (`worker/`) — **auth + persistence + open-banking proxy + static-asset
  serving**. No forecast logic. Bound to D1 as `env.DB`, assets as `env.ASSETS`.
- **Access** — Cloudflare Access sits in front of the one Worker hostname; the
  Worker also independently validates the Access JWT on every `/api/*` request.

```
Browser ─► Cloudflare Access ─► Worker (budget-planner)
                                   ├─ "/"      → React app (web/dist via ASSETS)
                                   ├─ "/api/*" → JSON API ─► D1 (budget_planner)
                                   └────────────────────  ─► GoCardless (open banking)
```

---

## Deploy it from your phone — Cloudflare only (no local tools)

Everything below is done in the **Cloudflare dashboard** in a mobile browser.
Cloudflare's **Workers Builds** connects to this GitHub repo and runs the build +
deploy on its own servers every time you push.

### 1. Connect the repo to Cloudflare Workers Builds
1. Cloudflare dash → **Workers & Pages → Create → Workers → Connect to Git**.
2. Authorise GitHub and pick this repository; choose the branch to deploy.
3. **Build command:** `npm run build --workspace web`
4. **Deploy command:** `bash scripts/cf-deploy.sh`
   - This script is idempotent: it creates the D1 database `budget_planner` if it
     doesn't exist, writes its id into `wrangler.toml`, applies the migrations
     (`migrations/0001_init.sql`), and deploys the Worker. The Workers Builds
     environment is already authenticated to your account, so no API token is
     needed.
5. **Save and Deploy.** When it finishes, your app is live at the Worker's URL
   (shown on the Worker page, e.g. `https://budget-planner.<your-subdomain>.workers.dev`).

> Prefer to do it by hand from a machine with Node? `npm install` then `npm run
> deploy` runs the exact same steps (needs `npx wrangler login` first).

### 2. Lock it down with Cloudflare Access
So only you can open it:
1. Cloudflare dash → **Zero Trust → Access → Applications → Add an application →
   Self-hosted**.
2. **Application domain:** the Worker's hostname from step 1.
   *(Access self-hosted apps need a Cloudflare-proxied hostname. `workers.dev`
   works once you add the Worker as the application domain; for a custom domain,
   add a route to the Worker on a zone you own and use that hostname.)*
3. **Policy:** Allow → rule **Emails** → your email only.
4. Save, open the app's **Overview**, copy the **Application Audience (AUD) Tag**.
5. Your **team domain** is under **Zero Trust → Settings** — it looks like
   `your-team.cloudflareaccess.com`.

### 3. Tell the Worker about Access
The Worker must know which Access app to trust. Set these as **Worker variables**
(Cloudflare dash → your Worker → **Settings → Variables**), or edit `wrangler.toml`
`[vars]` and push:

```toml
[vars]
CF_ACCESS_TEAM_DOMAIN = "your-team.cloudflareaccess.com"
CF_ACCESS_AUD = "your_access_application_aud_tag"
```

The Worker fetches the team's signing keys from
`https://<team>/cdn-cgi/access/certs`, verifies the RS256 signature, and checks
`aud`, `iss`, and `exp`. Until these are set to real values, the only way in is
the local dev bypass (below), which is ignored once they're real.

### 4. (Optional) Open banking — GoCardless
Auto-import actuals from your bank via the free GoCardless Bank Account Data API.
Add the credentials as **Worker secrets** (Worker → **Settings → Variables →
Encrypt**, or via CLI). While unset, `/api/ob/*` returns `503 GoCardless not
configured` and the UI shows a friendly "not configured yet" message — nothing
breaks.

```bash
npx wrangler secret put GOCARDLESS_SECRET_ID
npx wrangler secret put GOCARDLESS_SECRET_KEY
```

Get credentials at <https://bankaccountdata.gocardless.com/>. Free-tier limits:
a consent (requisition) lasts **90 days** then must be renewed, and transaction
pulls are throttled to roughly **4/day per account** — take snapshots rather than
polling.

> Open banking is wired but **cannot be verified without live credentials and a
> real bank consent**.

---

## API

The Worker exposes the JSON API consumed by `web/src/api/client.ts`:

| Route                                | Method     | Purpose                                |
| ------------------------------------ | ---------- | -------------------------------------- |
| `/api/state`                         | GET / PUT  | Whole plan document (load / replace)   |
| `/api/snapshots`                     | GET / POST | List / create snapshots                |
| `/api/snapshots/:id`                 | DELETE     | Delete a snapshot                      |
| `/api/actuals?period=YYYY-MM`        | GET / PUT  | Read / replace a month's actuals       |
| `/api/tax-config[?tax_year=YYYY/YY]` | GET / PUT  | Read / upsert tax configuration        |
| `/api/ob/institutions?country=GB`    | GET        | List banks (GoCardless)                |
| `/api/ob/connect`                    | POST       | Create a consent requisition           |
| `/api/ob/accounts?requisition=ID`    | GET        | Accounts behind a requisition          |
| `/api/ob/transactions?account=ID`    | GET        | Normalised transactions for an account |

Every `/api/*` request must carry a valid Access JWT, else `401`.

---

## Local development (optional)

You don't need this to host it, but if you have Node 18+:

```bash
npm install
npm run db:migrate:local            # seed the local D1
printf 'DEV_BYPASS_AUTH = "true"\n' > .dev.vars   # skip Access locally
npm run dev:worker                  # Worker on :8787 (serves app + API)
# in another terminal, for hot-reloading UI:
npm run dev:web                     # Vite on :5173, proxies /api → :8787
```

The dev bypass is honoured **only** while `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD`
are still placeholders, so it can never weaken production.

---

## Data model notes

- The plan document (`/api/state`) is the single source of truth held in the
  browser. On `PUT`, the Worker wipes and re-inserts all eight plan tables in one
  D1 `batch()`. Client row **ids are preserved exactly** (including negative
  temporary ids) so `scenario_overrides` / `events` references stay intact.
- SQLite integer booleans (`active`, `ring_fenced`) are normalised to real JS
  booleans on read.
- `tax_config.bands` / `ni_thresholds` / `ni_rates` are JSON text, parsed on `GET`.
- Tax config is seeded with **2026/27 rUK** figures; change the tax year in one
  place (Settings → Tax configuration).

## Project layout

```
web/                 React + Vite SPA (pure-TS engine + UI)
worker/
  src/index.ts       Worker entry, router, static-asset fallback, shared types
  src/auth.ts        Cloudflare Access JWT verification
  src/db.ts          D1 persistence helpers
  src/openbanking.ts GoCardless proxy
migrations/          D1 schema (0001_init.sql)
scripts/cf-deploy.sh Cloudflare deploy command (D1 create + migrate + deploy)
wrangler.toml        Worker + assets + D1 + Access vars
```

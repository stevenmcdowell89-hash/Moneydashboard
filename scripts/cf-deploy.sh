#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Cloudflare deploy command for the Budget & Scenario Planner.
#
# Used as the "Deploy command" in Cloudflare Workers Builds (Connect to Git),
# OR runnable directly with `bash scripts/cf-deploy.sh` if you have wrangler
# authenticated (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in the env).
#
# It is idempotent: creates the D1 database if missing, writes its id into
# wrangler.toml, applies migrations, then deploys the Worker (app + API).
# ---------------------------------------------------------------------------
set -euo pipefail

DB_NAME="budget_planner"

echo "→ Ensuring D1 database '$DB_NAME' exists…"
npx wrangler d1 create "$DB_NAME" 2>/dev/null || true

echo "→ Resolving database id…"
DB_ID=$(npx wrangler d1 info "$DB_NAME" --json 2>/dev/null \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(j.uuid||j.database_id||(j.result&&j.result.uuid)||'')}catch{console.log('')}})")

if [ -z "$DB_ID" ]; then
  DB_ID=$(npx wrangler d1 list --json \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const r=Array.isArray(j)?j:(j.result||[]);const m=r.find(x=>x.name==='$DB_NAME');console.log(m?(m.uuid||m.database_id):'')})")
fi

if [ -z "$DB_ID" ]; then
  echo "✗ Could not resolve the D1 database id." >&2
  exit 1
fi
echo "  id: $DB_ID"

# Inject the id into wrangler.toml (only if still the placeholder).
sed -i.bak "s/REPLACE_WITH_YOUR_D1_DATABASE_ID/$DB_ID/" wrangler.toml && rm -f wrangler.toml.bak

echo "→ Applying migrations (remote)…"
npx wrangler d1 migrations apply "$DB_NAME" --remote

echo "→ Deploying Worker (app + API)…"
npx wrangler deploy

echo "✓ Deployed."

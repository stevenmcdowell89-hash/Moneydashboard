#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Cloudflare deploy command for the Budget & Scenario Planner.
#
# Used as the "Deploy command" in Cloudflare Workers Builds (Connect to Git),
# OR runnable directly with `bash scripts/cf-deploy.sh` if wrangler is
# authenticated (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in the env).
#
# The D1 database already exists and its id is pinned in wrangler.toml, so this
# just applies any pending migrations (idempotent) and deploys the Worker.
#
# Recreating the DB from scratch? Run `wrangler d1 create budget_planner` and
# paste the new id into wrangler.toml's [[d1_databases]] block.
# ---------------------------------------------------------------------------
set -euo pipefail

echo "→ Applying D1 migrations (remote, idempotent)…"
npx wrangler d1 migrations apply budget_planner --remote

echo "→ Deploying Worker (app + API)…"
npx wrangler deploy

echo "✓ Deployed."

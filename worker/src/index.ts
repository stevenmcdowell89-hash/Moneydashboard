// ============================================================================
// Budget & Scenario Planner — Cloudflare Worker.
//
// Responsibilities: auth (Cloudflare Access JWT), persistence (D1), and an
// open-banking proxy (GoCardless). NO forecast/engine logic lives here — the
// engine runs client-side. Routes mirror web/src/api/client.ts exactly.
//
// This module is also the single home for the shared row/type definitions
// (mirrored from web/src/types.ts) so the worker compiles in isolation without
// pulling the concurrently-edited web/ workspace into tsc.
// ============================================================================

import { verifyAccess } from './auth';
import type { Env } from './auth';
import {
  readState,
  writeState,
  listSnapshots,
  createSnapshot,
  deleteSnapshot,
  getActuals,
  putActuals,
  getTaxConfig,
  putTaxConfig,
} from './db';
import {
  listInstitutions,
  createRequisition,
  getAccounts,
  getTransactions,
  ObNotConfigured,
  ObUpstreamError,
} from './openbanking';

export type { Env } from './auth';

// ----------------------------------------------------------------------------
// Shared types (mirror of web/src/types.ts row shapes — keep in lock-step).
// ----------------------------------------------------------------------------
export type Frequency = 'Monthly' | 'Quarterly' | 'Annual' | 'Weekly' | '4-weekly';
export type EntryMode = 'net' | 'gross';
export type PensionType = 'salary_sacrifice' | 'net_pay' | 'relief_at_source';
export type ScenarioType = 'adjustment' | 'target';
export type ItemType = 'income' | 'bill' | 'savings';

export interface Settings {
  id: 1;
  opening_cash: number;
  projection_months_default: number;
  currency: string;
  tax_year: string;
}

export interface Income {
  id: number;
  name: string;
  entry_mode: EntryMode;
  frequency: Frequency;
  active: boolean;
  net_amount: number | null;
  gross_annual: number | null;
  pension_rate: number | null;
  pension_type: PensionType | null;
  sacrifice_monthly: number | null;
  tax_code: string | null;
}

export interface IncomeOneoff {
  id: number;
  name: string;
  gross_amount: number;
  month: number;
  pension_sacrifice_pct: number | null;
}

export interface Bill {
  id: number;
  name: string;
  category: string | null;
  amount: number;
  frequency: Frequency;
  active: boolean;
}

export interface SavingsTarget {
  id: number;
  name: string;
  balance: number;
  monthly_contribution: number;
  annual_rate: number;
  target_amount: number | null;
  target_month: number | null;
  ring_fenced: boolean;
}

export interface PlanEvent {
  id: number;
  name: string;
  total_cost: number;
  start_month: number;
  duration_months: number;
  applies_to: string;
}

export interface Scenario {
  id: number;
  name: string;
  type: ScenarioType;
  target_id: number | null;
  created_at: string;
}

export interface ScenarioOverride {
  id: number;
  scenario_id: number;
  item_type: ItemType;
  item_id: number;
  override_amount: number | null;
}

export interface PlanState {
  settings: Settings;
  income: Income[];
  income_oneoff: IncomeOneoff[];
  bills: Bill[];
  savings_targets: SavingsTarget[];
  events: PlanEvent[];
  scenarios: Scenario[];
  scenario_overrides: ScenarioOverride[];
}

export interface TaxBand {
  threshold: number;
  rate: number;
}

export interface NiThresholds {
  primary: number;
  upper: number;
  taper_start?: number;
}

export interface NiRates {
  main: number;
  upper: number;
}

export interface TaxConfig {
  tax_year: string;
  region: string;
  personal_allowance: number;
  bands: TaxBand[];
  ni_thresholds: NiThresholds;
  ni_rates: NiRates;
}

export interface Snapshot {
  id: number;
  taken_on: string;
  label: string | null;
  payload: string;
  m_free_cash: number | null;
  m_bills: number | null;
  m_cash_bal: number | null;
  m_savings_total: number | null;
}

export interface Actual {
  id: number;
  period: string;
  bill_id: number;
  planned_amount: number | null;
  actual_amount: number | null;
  note: string | null;
}

export interface ObInstitution {
  id: string;
  name: string;
  bic?: string;
  logo?: string;
  transaction_total_days?: string;
}

export interface ObRequisition {
  id: string;
  link: string;
  status: string;
  accounts: string[];
}

export interface ObAccount {
  id: string;
  iban?: string;
  name?: string;
  ownerName?: string;
  currency?: string;
}

export interface ObTransaction {
  transactionId?: string;
  bookingDate?: string;
  valueDate?: string;
  amount: number;
  currency: string;
  description: string;
  raw?: unknown;
}

// ----------------------------------------------------------------------------
// HTTP helpers
// ----------------------------------------------------------------------------
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Cf-Access-Jwt-Assertion',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

// ----------------------------------------------------------------------------
// Worker entrypoint
// ----------------------------------------------------------------------------
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight — answer before auth.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const { pathname } = url;

    // Non-API requests serve the React SPA from the static-assets binding.
    // (Asset files are normally served before the Worker runs; this is the
    // fallback for client routes — SPA handling returns index.html.)
    if (!pathname.startsWith('/api/')) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return error('Not found', 404);
    }

    // Every API request validates the Access JWT first.
    const authed = await verifyAccess(request, env).catch(() => false);
    if (!authed) {
      return error('Unauthorised', 401);
    }

    try {
      return await route(request, env, url);
    } catch (e) {
      if (e instanceof ObNotConfigured) {
        return error('GoCardless not configured', 503);
      }
      if (e instanceof ObUpstreamError) {
        return error(e.message, 502);
      }
      const message = e instanceof Error ? e.message : 'Internal error';
      return error(message, 500);
    }
  },
};

// ----------------------------------------------------------------------------
// Router
// ----------------------------------------------------------------------------
async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const { pathname } = url;
  const method = request.method;
  const db = env.DB;

  // --- /api/state ---------------------------------------------------------
  if (pathname === '/api/state') {
    if (method === 'GET') {
      return json(await readState(db));
    }
    if (method === 'PUT') {
      const body = await readJson<PlanState>(request);
      await writeState(db, body);
      return json({ ok: true });
    }
    return error('Method not allowed', 405);
  }

  // --- /api/snapshots and /api/snapshots/:id ------------------------------
  if (pathname === '/api/snapshots') {
    if (method === 'GET') {
      return json(await listSnapshots(db));
    }
    if (method === 'POST') {
      const body = await readJson<
        Pick<Snapshot, 'label' | 'payload' | 'm_free_cash' | 'm_bills' | 'm_cash_bal' | 'm_savings_total'>
      >(request);
      return json(await createSnapshot(db, body));
    }
    return error('Method not allowed', 405);
  }

  const snapMatch = pathname.match(/^\/api\/snapshots\/(\d+)$/);
  if (snapMatch) {
    if (method === 'DELETE') {
      await deleteSnapshot(db, Number(snapMatch[1]));
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    return error('Method not allowed', 405);
  }

  // --- /api/actuals?period=YYYY-MM ---------------------------------------
  if (pathname === '/api/actuals') {
    const period = url.searchParams.get('period');
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return error('Missing or invalid period (YYYY-MM)', 400);
    }
    if (method === 'GET') {
      return json(await getActuals(db, period));
    }
    if (method === 'PUT') {
      const rows = await readJson<Omit<Actual, 'id'>[]>(request);
      return json(await putActuals(db, period, rows));
    }
    return error('Method not allowed', 405);
  }

  // --- /api/tax-config ----------------------------------------------------
  if (pathname === '/api/tax-config') {
    if (method === 'GET') {
      const taxYear = url.searchParams.get('tax_year') ?? undefined;
      const cfg = await getTaxConfig(db, taxYear);
      if (!cfg) return error('Tax config not found', 404);
      return json(cfg);
    }
    if (method === 'PUT') {
      const cfg = await readJson<TaxConfig>(request);
      return json(await putTaxConfig(db, cfg));
    }
    return error('Method not allowed', 405);
  }

  // --- /api/ob/* (open banking) ------------------------------------------
  if (pathname === '/api/ob/institutions') {
    if (method !== 'GET') return error('Method not allowed', 405);
    const country = url.searchParams.get('country') ?? 'GB';
    return json(await listInstitutions(env, country));
  }

  if (pathname === '/api/ob/connect') {
    if (method !== 'POST') return error('Method not allowed', 405);
    const body = await readJson<{ institutionId: string }>(request);
    if (!body.institutionId) return error('institutionId required', 400);
    // Redirect back to the app origin after consent.
    const redirect = `${url.origin}/ob/callback`;
    return json(await createRequisition(env, body.institutionId, redirect));
  }

  if (pathname === '/api/ob/accounts') {
    if (method !== 'GET') return error('Method not allowed', 405);
    const requisition = url.searchParams.get('requisition');
    if (!requisition) return error('requisition required', 400);
    return json(await getAccounts(env, requisition));
  }

  if (pathname === '/api/ob/transactions') {
    if (method !== 'GET') return error('Method not allowed', 405);
    const account = url.searchParams.get('account');
    if (!account) return error('account required', 400);
    return json(await getTransactions(env, account));
  }

  return error('Not found', 404);
}

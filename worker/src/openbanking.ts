// ============================================================================
// GoCardless Bank Account Data API proxy.
// https://bankaccountdata.gocardless.com/api/v2/
//
// Flow:
//   1. POST /token/new/      -> { access, refresh } (cached in-isolate)
//   2. GET  /institutions/   -> list banks for a country
//   3. POST /requisitions/   -> { id, link } (user visits `link` to consent)
//   4. GET  /requisitions/{id}/ -> { accounts: [...] } after consent
//   5. GET  /accounts/{id}/transactions/ -> booked + pending transactions
//
// IMPORTANT constraints (free tier):
//   - Consent (requisition) is valid for 90 days, then must be renewed.
//   - Per-account transaction pulls are rate-limited to ~4 requests/day.
//     Cache results client-side / snapshot rather than polling.
//
// Secrets GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY are Worker secrets and
// will be UNSET in a fresh deploy. When missing we throw ObNotConfigured, which
// index.ts maps to HTTP 503 "GoCardless not configured".
// ============================================================================

import type { Env } from './index';
import type { ObInstitution, ObRequisition, ObAccount, ObTransaction } from './index';

const GC_BASE = 'https://bankaccountdata.gocardless.com/api/v2';

// Thrown when credentials are absent -> 503 upstream.
export class ObNotConfigured extends Error {
  constructor() {
    super('GoCardless not configured');
    this.name = 'ObNotConfigured';
  }
}

// Thrown for upstream API errors -> 502 upstream.
export class ObUpstreamError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ObUpstreamError';
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Access-token cache (per-isolate). Tokens last 24h; refresh ~10 min early.
// ---------------------------------------------------------------------------
interface CachedToken {
  access: string;
  expiresAt: number; // epoch ms
}
let tokenCache: CachedToken | null = null;

function requireCreds(env: Env): { id: string; key: string } {
  const id = env.GOCARDLESS_SECRET_ID;
  const key = env.GOCARDLESS_SECRET_KEY;
  if (!id || !key || id.startsWith('REPLACE_WITH') || key.startsWith('REPLACE_WITH')) {
    throw new ObNotConfigured();
  }
  return { id, key };
}

async function gcFetch(
  path: string,
  init: RequestInit,
  expectJson = true,
): Promise<unknown> {
  const res = await fetch(`${GC_BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ObUpstreamError(`GoCardless ${res.status}: ${body || res.statusText}`, res.status);
  }
  return expectJson ? res.json() : undefined;
}

async function getAccessToken(env: Env): Promise<string> {
  const { id, key } = requireCreds(env);
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.access;
  }
  const data = (await gcFetch('/token/new/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ secret_id: id, secret_key: key }),
  })) as { access: string; access_expires?: number };

  const ttlSec = typeof data.access_expires === 'number' ? data.access_expires : 86400;
  tokenCache = {
    access: data.access,
    expiresAt: Date.now() + Math.max(ttlSec - 600, 60) * 1000,
  };
  return data.access;
}

async function authHeaders(env: Env): Promise<Record<string, string>> {
  const token = await getAccessToken(env);
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Institutions
// ---------------------------------------------------------------------------
export async function listInstitutions(env: Env, country = 'GB'): Promise<ObInstitution[]> {
  const headers = await authHeaders(env);
  const data = (await gcFetch(
    `/institutions/?country=${encodeURIComponent(country)}`,
    { method: 'GET', headers },
  )) as Array<{
    id: string;
    name: string;
    bic?: string;
    logo?: string;
    transaction_total_days?: string;
  }>;
  return data.map((i) => ({
    id: i.id,
    name: i.name,
    bic: i.bic,
    logo: i.logo,
    transaction_total_days: i.transaction_total_days,
  }));
}

// ---------------------------------------------------------------------------
// Requisition (consent). Returns the link the user must visit.
// ---------------------------------------------------------------------------
export async function createRequisition(
  env: Env,
  institutionId: string,
  redirect: string,
): Promise<ObRequisition> {
  const headers = await authHeaders(env);
  const reference = `budget-${Date.now()}`;
  const data = (await gcFetch('/requisitions/', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      institution_id: institutionId,
      redirect,
      reference,
      user_language: 'EN',
    }),
  })) as { id: string; link: string; status?: string; accounts?: string[] };
  return {
    id: data.id,
    link: data.link,
    status: data.status ?? 'CR',
    accounts: data.accounts ?? [],
  };
}

// ---------------------------------------------------------------------------
// Accounts behind a requisition (after the user has consented).
// ---------------------------------------------------------------------------
export async function getAccounts(env: Env, requisitionId: string): Promise<ObAccount[]> {
  const headers = await authHeaders(env);
  const req = (await gcFetch(`/requisitions/${encodeURIComponent(requisitionId)}/`, {
    method: 'GET',
    headers,
  })) as { accounts?: string[] };

  const ids = req.accounts ?? [];
  const accounts: ObAccount[] = [];
  for (const accountId of ids) {
    try {
      const det = (await gcFetch(`/accounts/${encodeURIComponent(accountId)}/details/`, {
        method: 'GET',
        headers,
      })) as { account?: Record<string, unknown> };
      const a = det.account ?? {};
      accounts.push({
        id: accountId,
        iban: a.iban as string | undefined,
        name: (a.name ?? a.product) as string | undefined,
        ownerName: a.ownerName as string | undefined,
        currency: a.currency as string | undefined,
      });
    } catch {
      // Details may be unavailable for some institutions; still expose the id.
      accounts.push({ id: accountId });
    }
  }
  return accounts;
}

// ---------------------------------------------------------------------------
// Transactions -> normalised ObTransaction[] (signed; money-out negative).
// ---------------------------------------------------------------------------
interface GcTransaction {
  transactionId?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount?: { amount?: string; currency?: string };
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  creditorName?: string;
  debtorName?: string;
}

function mapTransaction(t: GcTransaction): ObTransaction {
  const rawAmount = Number(t.transactionAmount?.amount ?? '0');
  const amount = Number.isFinite(rawAmount) ? rawAmount : 0;
  const description =
    t.remittanceInformationUnstructured ||
    (t.remittanceInformationUnstructuredArray && t.remittanceInformationUnstructuredArray.join(' ')) ||
    t.creditorName ||
    t.debtorName ||
    '';
  return {
    transactionId: t.transactionId,
    bookingDate: t.bookingDate,
    valueDate: t.valueDate,
    amount, // GoCardless already signs: outgoings negative, incoming positive.
    currency: t.transactionAmount?.currency ?? 'GBP',
    description,
    raw: t,
  };
}

export async function getTransactions(env: Env, accountId: string): Promise<ObTransaction[]> {
  const headers = await authHeaders(env);
  const data = (await gcFetch(`/accounts/${encodeURIComponent(accountId)}/transactions/`, {
    method: 'GET',
    headers,
  })) as { transactions?: { booked?: GcTransaction[]; pending?: GcTransaction[] } };

  const booked = data.transactions?.booked ?? [];
  const pending = data.transactions?.pending ?? [];
  return [...booked, ...pending].map(mapTransaction);
}

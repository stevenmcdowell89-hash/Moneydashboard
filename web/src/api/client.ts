// Thin client to the Cloudflare Worker. All persistence goes through here.
// Cloudflare Access injects the auth cookie/JWT automatically on the browser,
// so we just send credentials and parse JSON.

import type {
  PlanState,
  Snapshot,
  Actual,
  TaxConfig,
  ObInstitution,
  ObRequisition,
  ObAccount,
  ObTransaction,
} from '../types';

const BASE = '/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (res.status === 401) {
    throw new Error('Unauthorised (Cloudflare Access). Reload to re-authenticate.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  getState: () => req<PlanState>('/state'),
  putState: (state: PlanState) =>
    req<{ ok: true }>('/state', { method: 'PUT', body: JSON.stringify(state) }),

  getSnapshots: () => req<Snapshot[]>('/snapshots'),
  createSnapshot: (s: Pick<Snapshot, 'label' | 'payload' | 'm_free_cash' | 'm_bills' | 'm_cash_bal' | 'm_savings_total'>) =>
    req<Snapshot>('/snapshots', { method: 'POST', body: JSON.stringify(s) }),
  deleteSnapshot: (id: number) => req<void>(`/snapshots/${id}`, { method: 'DELETE' }),

  getActuals: (period: string) => req<Actual[]>(`/actuals?period=${encodeURIComponent(period)}`),
  putActuals: (period: string, rows: Omit<Actual, 'id'>[]) =>
    req<Actual[]>(`/actuals?period=${encodeURIComponent(period)}`, {
      method: 'PUT',
      body: JSON.stringify(rows),
    }),

  getTaxConfig: (taxYear?: string) =>
    req<TaxConfig>(`/tax-config${taxYear ? `?tax_year=${encodeURIComponent(taxYear)}` : ''}`),
  putTaxConfig: (cfg: TaxConfig) =>
    req<TaxConfig>('/tax-config', { method: 'PUT', body: JSON.stringify(cfg) }),

  // Open banking (GoCardless) — see worker/src/openbanking.ts
  obInstitutions: (country = 'GB') => req<ObInstitution[]>(`/ob/institutions?country=${country}`),
  obConnect: (institutionId: string) =>
    req<ObRequisition>('/ob/connect', { method: 'POST', body: JSON.stringify({ institutionId }) }),
  obAccounts: (requisitionId: string) =>
    req<ObAccount[]>(`/ob/accounts?requisition=${encodeURIComponent(requisitionId)}`),
  obTransactions: (accountId: string) =>
    req<ObTransaction[]>(`/ob/transactions?account=${encodeURIComponent(accountId)}`),
};

export type Api = typeof api;

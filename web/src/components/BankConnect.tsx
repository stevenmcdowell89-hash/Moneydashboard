// §10 Bank connect (GoCardless Bank Account Data).
// Degrades gracefully: all OB calls fail (503/Not configured) until credentials
// are set, so every step catches errors and shows a friendly message.

import { useState } from 'react';
import { api } from '../api/client';
import type { ObInstitution, ObAccount, ObTransaction } from '../types';
import { Button, Select, Badge, Card } from './ui';
import { gbp2 } from '../types';

const NOT_CONFIGURED =
  "Bank import isn't configured yet — add GoCardless credentials (see README §Open banking).";

type Step = 'idle' | 'pick-institution' | 'connected' | 'pick-account';

export default function BankConnect({
  onTransactions,
}: {
  onTransactions?: (txns: ObTransaction[]) => void;
}) {
  const [step, setStep] = useState<Step>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [institutions, setInstitutions] = useState<ObInstitution[]>([]);
  const [institutionId, setInstitutionId] = useState('');

  const [requisitionId, setRequisitionId] = useState('');
  const [link, setLink] = useState('');

  const [accounts, setAccounts] = useState<ObAccount[]>([]);
  const [accountId, setAccountId] = useState('');

  const [txns, setTxns] = useState<ObTransaction[]>([]);

  function fail(e: unknown) {
    // Any failure here means OB is not wired up; show the friendly message.
    console.error('bank connect failed', e);
    setError(NOT_CONFIGURED);
  }

  async function startConnect() {
    setBusy(true);
    setError(null);
    try {
      const list = await api.obInstitutions('GB');
      setInstitutions(list);
      setStep('pick-institution');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    if (!institutionId) return;
    setBusy(true);
    setError(null);
    try {
      const req = await api.obConnect(institutionId);
      setRequisitionId(req.id);
      setLink(req.link);
      setStep('connected');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function loadAccounts() {
    if (!requisitionId) return;
    setBusy(true);
    setError(null);
    try {
      const list = await api.obAccounts(requisitionId);
      setAccounts(list);
      setStep('pick-account');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function loadTransactions() {
    if (!accountId) return;
    setBusy(true);
    setError(null);
    try {
      const list = await api.obTransactions(accountId);
      setTxns(list);
      onTransactions?.(list);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep('idle');
    setError(null);
    setInstitutions([]);
    setInstitutionId('');
    setRequisitionId('');
    setLink('');
    setAccounts([]);
    setAccountId('');
    setTxns([]);
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3">
        {error && (
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-warn ring-1 ring-amber-200">
            {error}
          </div>
        )}

        {step === 'idle' && (
          <Button onClick={startConnect} disabled={busy}>
            {busy ? 'Connecting…' : 'Connect a bank'}
          </Button>
        )}

        {step === 'pick-institution' && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-600">Choose your bank</label>
            <Select
              value={institutionId}
              onChange={(e) => setInstitutionId(e.target.value)}
            >
              <option value="">Select a bank…</option>
              {institutions.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                </option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Button onClick={connect} disabled={busy || !institutionId}>
                {busy ? 'Connecting…' : 'Connect'}
              </Button>
              <Button variant="subtle" onClick={reset} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === 'connected' && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-slate-600">
              Authorise access in your bank, then come back and load your accounts.
            </p>
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-accent hover:underline"
              >
                Open consent page ↗
              </a>
            )}
            <div className="flex gap-2">
              <Button onClick={loadAccounts} disabled={busy}>
                {busy ? 'Loading…' : 'Load accounts'}
              </Button>
              <Button variant="subtle" onClick={reset} disabled={busy}>
                Start over
              </Button>
            </div>
          </div>
        )}

        {step === 'pick-account' && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-600">Choose an account</label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Select an account…</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name || acc.iban || acc.id}
                  {acc.currency ? ` (${acc.currency})` : ''}
                </option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Button onClick={loadTransactions} disabled={busy || !accountId}>
                {busy ? 'Loading…' : 'Load transactions'}
              </Button>
              <Button variant="subtle" onClick={reset} disabled={busy}>
                Start over
              </Button>
            </div>
          </div>
        )}

        {txns.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">
                {txns.length} transactions imported
              </span>
              <Badge tone="good">Imported</Badge>
            </div>
            <ul className="mt-1 divide-y divide-slate-100 text-sm">
              {txns.slice(0, 20).map((t, i) => (
                <li
                  key={t.transactionId ?? i}
                  className="flex items-center justify-between py-1.5"
                >
                  <span className="truncate pr-2 text-slate-600">
                    {t.bookingDate ? `${t.bookingDate} · ` : ''}
                    {t.description || '(no description)'}
                  </span>
                  <span
                    className={`tabular-nums ${t.amount < 0 ? 'text-bad' : 'text-good'}`}
                  >
                    {gbp2(t.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

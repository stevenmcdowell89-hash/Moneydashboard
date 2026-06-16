// §8 Actuals — record real spend per bill for a chosen period, compare to plan,
// roll up by category, and optionally pull figures in from a connected bank.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { normalizeFrequency } from '../engine';
import { api } from '../api/client';
import type { Actual, Bill, ObTransaction } from '../types';
import { gbp2 } from '../types';
import {
  Card,
  Section,
  Button,
  TextInput,
  MoneyInput,
  Select,
  Badge,
  Stat,
  EmptyState,
} from '../components/ui';
import BankConnect from '../components/BankConnect';

type Row = {
  bill_id: number;
  actual_amount: number | null;
  note: string | null;
};

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function plannedFor(bill: Bill): number {
  return normalizeFrequency(bill.amount, bill.frequency);
}

// Lightweight name-similarity for suggesting a bill match for a transaction.
function similarity(a: string, b: string): number {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const aw = norm(a);
  const bw = new Set(norm(b));
  if (aw.length === 0) return 0;
  const hits = aw.filter((w) => bw.has(w)).length;
  return hits / aw.length;
}

export default function Actuals() {
  const { plan } = useStore();
  const [period, setPeriod] = useState<string>(currentPeriod());
  const [rows, setRows] = useState<Record<number, Row>>({});
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [imported, setImported] = useState<ObTransaction[]>([]);

  const activeBills = useMemo(() => plan.bills.filter((b) => b.active), [plan.bills]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing actuals for the period and merge with current bills.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getActuals(period)
      .then((existing) => {
        if (cancelled) return;
        const next: Record<number, Row> = {};
        for (const a of existing) {
          next[a.bill_id] = {
            bill_id: a.bill_id,
            actual_amount: a.actual_amount,
            note: a.note,
          };
        }
        setRows(next);
      })
      .catch(() => {
        if (!cancelled) setRows({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  function buildPayload(current: Record<number, Row>): Omit<Actual, 'id'>[] {
    return activeBills.map((bill) => {
      const r = current[bill.id];
      return {
        period,
        bill_id: bill.id,
        planned_amount: plannedFor(bill),
        actual_amount: r?.actual_amount ?? null,
        note: r?.note ?? null,
      };
    });
  }

  async function save(current: Record<number, Row>) {
    setSaveState('saving');
    try {
      await api.putActuals(period, buildPayload(current));
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }

  function scheduleSave(next: Record<number, Row>) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(next), 600);
  }

  function setRow(billId: number, patch: Partial<Row>) {
    setRows((prev) => {
      const next: Record<number, Row> = {
        ...prev,
        [billId]: {
          bill_id: billId,
          actual_amount: prev[billId]?.actual_amount ?? null,
          note: prev[billId]?.note ?? null,
          ...patch,
        },
      };
      scheduleSave(next);
      return next;
    });
  }

  // Category rollups: total planned vs actual vs variance per category.
  const rollups = useMemo(() => {
    const map = new Map<string, { planned: number; actual: number }>();
    for (const bill of activeBills) {
      const cat = bill.category || 'Uncategorised';
      const entry = map.get(cat) ?? { planned: 0, actual: 0 };
      entry.planned += plannedFor(bill);
      entry.actual += rows[bill.id]?.actual_amount ?? 0;
      map.set(cat, entry);
    }
    return [...map.entries()]
      .map(([category, v]) => ({ category, ...v, variance: v.actual - v.planned }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [activeBills, rows]);

  const totals = useMemo(() => {
    let planned = 0;
    let actual = 0;
    for (const bill of activeBills) {
      planned += plannedFor(bill);
      actual += rows[bill.id]?.actual_amount ?? 0;
    }
    return { planned, actual, variance: actual - planned };
  }, [activeBills, rows]);

  return (
    <div className="mx-auto max-w-3xl px-3 py-4">
      <Section
        title="Actuals"
        action={
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value || currentPeriod())}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-blue-100"
          />
        }
      >
        <Card className="p-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Planned" value={gbp2(totals.planned)} />
            <Stat label="Actual" value={gbp2(totals.actual)} />
            <Stat
              label="Variance"
              value={gbp2(totals.variance)}
              tone={totals.variance > 0 ? 'bad' : totals.variance < 0 ? 'good' : 'default'}
            />
          </div>
        </Card>
      </Section>

      <Section title="Import from bank (optional)">
        <BankConnect onTransactions={setImported} />
        {imported.length > 0 && (
          <div className="mt-2">
            <Card className="p-4">
              <p className="mb-2 text-sm text-slate-600">
                Assign an imported transaction to a bill to set its actual for {period}.
              </p>
              <ul className="divide-y divide-slate-100">
                {imported.slice(0, 20).map((t, i) => {
                  // Suggest the best-matching active bill by name similarity.
                  let suggested = '';
                  let best = 0.34; // require a minimum overlap to suggest
                  for (const b of activeBills) {
                    const s = similarity(t.description || '', b.name);
                    if (s > best) {
                      best = s;
                      suggested = String(b.id);
                    }
                  }
                  return (
                    <li
                      key={t.transactionId ?? i}
                      className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-slate-700">
                          {t.description || '(no description)'}
                        </div>
                        <div className="text-xs text-slate-400">
                          {t.bookingDate ?? ''} · {gbp2(Math.abs(t.amount))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:w-64">
                        <Select
                          defaultValue={suggested}
                          onChange={(e) => {
                            const id = Number(e.target.value);
                            if (id) setRow(id, { actual_amount: Math.abs(t.amount) });
                          }}
                        >
                          <option value="">→ assign to bill…</option>
                          {activeBills.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        )}
      </Section>

      <Section
        title="By bill"
        action={
          <div className="flex items-center gap-2">
            {saveState === 'saving' && <span className="text-xs text-slate-400">Saving…</span>}
            {saveState === 'saved' && <Badge tone="good">Saved</Badge>}
            {saveState === 'error' && <Badge tone="bad">Save failed</Badge>}
            <Button size="sm" variant="subtle" onClick={() => void save(rows)}>
              Save
            </Button>
          </div>
        }
      >
        {loading ? (
          <Card className="p-4 text-sm text-slate-400">Loading…</Card>
        ) : activeBills.length === 0 ? (
          <EmptyState title="No active bills" hint="Add bills to your plan to track actuals." />
        ) : (
          <Card className="divide-y divide-slate-100">
            {activeBills.map((bill) => {
              const planned = plannedFor(bill);
              const r = rows[bill.id];
              const actual = r?.actual_amount;
              const variance = actual == null ? null : actual - planned;
              return (
                <div key={bill.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-700">{bill.name}</div>
                      <div className="text-xs text-slate-400">
                        {bill.category || 'Uncategorised'} · planned {gbp2(planned)}
                      </div>
                    </div>
                    {variance != null && (
                      <Badge tone={variance > 0 ? 'bad' : variance < 0 ? 'good' : 'default'}>
                        {variance > 0 ? '+' : ''}
                        {gbp2(variance)}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <MoneyInput
                      className="sm:w-40"
                      value={actual}
                      placeholder="Actual"
                      step="0.01"
                      onChange={(n) => setRow(bill.id, { actual_amount: n })}
                    />
                    <TextInput
                      className="flex-1"
                      placeholder="Note (optional)"
                      value={r?.note ?? ''}
                      onChange={(e) => setRow(bill.id, { note: e.target.value || null })}
                    />
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </Section>

      <Section title="By category">
        {rollups.length === 0 ? (
          <EmptyState title="Nothing to roll up yet" />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 text-right font-medium">Planned</th>
                  <th className="px-3 py-2 text-right font-medium">Actual</th>
                  <th className="px-3 py-2 text-right font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {rollups.map((r) => (
                  <tr key={r.category} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-2 text-slate-700">{r.category}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{gbp2(r.planned)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{gbp2(r.actual)}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        r.variance > 0 ? 'text-bad' : r.variance < 0 ? 'text-good' : ''
                      }`}
                    >
                      {r.variance > 0 ? '+' : ''}
                      {gbp2(r.variance)}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{gbp2(totals.planned)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{gbp2(totals.actual)}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      totals.variance > 0 ? 'text-bad' : totals.variance < 0 ? 'text-good' : ''
                    }`}
                  >
                    {totals.variance > 0 ? '+' : ''}
                    {gbp2(totals.variance)}
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>
        )}
      </Section>
    </div>
  );
}

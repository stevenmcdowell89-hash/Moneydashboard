// §8 History — capture point-in-time snapshots of the plan with key metrics,
// chart their trend over the months actually captured, and diff any two.

import { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useStore } from '../state/store';
import { resolveScenario, project } from '../engine';
import { api } from '../api/client';
import type { Snapshot } from '../types';
import { gbp2 } from '../types';
import {
  Card,
  Section,
  Button,
  TextInput,
  Select,
  Stat,
  Badge,
  EmptyState,
} from '../components/ui';

const METRICS = [
  { key: 'm_cash_bal', label: 'Cash balance' },
  { key: 'm_savings_total', label: 'Savings total' },
  { key: 'm_free_cash', label: 'Free cash' },
  { key: 'm_bills', label: 'Bills' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function History() {
  const { plan, taxConfig, flush } = useStore();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cmpA, setCmpA] = useState<string>('');
  const [cmpB, setCmpB] = useState<string>('');

  async function load() {
    try {
      const list = await api.getSnapshots();
      // Newest first.
      setSnapshots([...list].sort((a, b) => b.taken_on.localeCompare(a.taken_on)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveSnapshot() {
    setBusy(true);
    setError(null);
    try {
      await flush(); // persist current plan first
      const resolved = resolveScenario(plan, null);
      const horizon = Math.max(1, plan.settings.projection_months_default || 24);
      const result = project(resolved, horizon, taxConfig);
      const p = result.points[0];
      const metrics = p
        ? {
            m_free_cash: p.netFlow + p.contributions, // income - bills - events
            m_bills: p.bills,
            m_cash_bal: p.cash,
            m_savings_total: p.savingsTotal,
          }
        : { m_free_cash: 0, m_bills: 0, m_cash_bal: 0, m_savings_total: 0 };
      await api.createSnapshot({
        label: label.trim() || null,
        payload: JSON.stringify(plan),
        ...metrics,
      });
      setLabel('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    try {
      await api.deleteSnapshot(id);
      setSnapshots((prev) => prev.filter((s) => s.id !== id));
      setCmpA((v) => (v === String(id) ? '' : v));
      setCmpB((v) => (v === String(id) ? '' : v));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Chart data in chronological (oldest-first) order over captured dates.
  const chartData = useMemo(
    () =>
      [...snapshots]
        .sort((a, b) => a.taken_on.localeCompare(b.taken_on))
        .map((s) => ({
          date: fmtDate(s.taken_on),
          m_cash_bal: s.m_cash_bal ?? 0,
          m_savings_total: s.m_savings_total ?? 0,
          m_free_cash: s.m_free_cash ?? 0,
        })),
    [snapshots],
  );

  const snapA = useMemo(() => snapshots.find((s) => String(s.id) === cmpA) ?? null, [snapshots, cmpA]);
  const snapB = useMemo(() => snapshots.find((s) => String(s.id) === cmpB) ?? null, [snapshots, cmpB]);

  return (
    <div className="mx-auto max-w-3xl px-3 py-4">
      <Section title="History">
        <Card className="p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Label (optional)
              </label>
              <TextInput
                value={label}
                placeholder="e.g. After pay rise"
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <Button onClick={() => void saveSnapshot()} disabled={busy}>
              {busy ? 'Saving…' : 'Save snapshot'}
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-bad">{error}</p>}
        </Card>
      </Section>

      {snapshots.length === 0 ? (
        <EmptyState
          title="No snapshots yet"
          hint="Save a snapshot to start tracking how your plan evolves over time."
        />
      ) : (
        <>
          <Section title="Trends">
            <Card className="p-3">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => gbp2(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="m_cash_bal" name="Cash" stroke="#2563eb" dot={false} />
                    <Line type="monotone" dataKey="m_savings_total" name="Savings" stroke="#16a34a" dot={false} />
                    <Line type="monotone" dataKey="m_free_cash" name="Free cash" stroke="#d97706" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Section>

          <Section title="Compare">
            <Card className="p-4">
              <div className="grid grid-cols-2 gap-2">
                <Select value={cmpA} onChange={(e) => setCmpA(e.target.value)}>
                  <option value="">Snapshot A…</option>
                  {snapshots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {fmtDate(s.taken_on)}
                      {s.label ? ` · ${s.label}` : ''}
                    </option>
                  ))}
                </Select>
                <Select value={cmpB} onChange={(e) => setCmpB(e.target.value)}>
                  <option value="">Snapshot B…</option>
                  {snapshots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {fmtDate(s.taken_on)}
                      {s.label ? ` · ${s.label}` : ''}
                    </option>
                  ))}
                </Select>
              </div>
              {snapA && snapB && (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-2 py-1 font-medium">Metric</th>
                      <th className="px-2 py-1 text-right font-medium">A</th>
                      <th className="px-2 py-1 text-right font-medium">B</th>
                      <th className="px-2 py-1 text-right font-medium">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map((m) => {
                      const a = snapA[m.key as MetricKey] ?? 0;
                      const b = snapB[m.key as MetricKey] ?? 0;
                      const diff = b - a;
                      return (
                        <tr key={m.key} className="border-t border-slate-50">
                          <td className="px-2 py-1 text-slate-700">{m.label}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{gbp2(a)}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{gbp2(b)}</td>
                          <td
                            className={`px-2 py-1 text-right tabular-nums ${
                              diff > 0 ? 'text-good' : diff < 0 ? 'text-bad' : ''
                            }`}
                          >
                            {diff > 0 ? '+' : ''}
                            {gbp2(diff)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          </Section>

          <Section title="Snapshots">
            <div className="flex flex-col gap-2">
              {snapshots.map((s) => (
                <Card key={s.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-700">{fmtDate(s.taken_on)}</span>
                        {s.label && <Badge>{s.label}</Badge>}
                      </div>
                    </div>
                    <Button size="sm" variant="danger" onClick={() => void remove(s.id)}>
                      Delete
                    </Button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label="Cash" value={gbp2(s.m_cash_bal ?? 0)} />
                    <Stat label="Savings" value={gbp2(s.m_savings_total ?? 0)} />
                    <Stat label="Free cash" value={gbp2(s.m_free_cash ?? 0)} />
                    <Stat label="Bills" value={gbp2(s.m_bills ?? 0)} />
                  </div>
                </Card>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

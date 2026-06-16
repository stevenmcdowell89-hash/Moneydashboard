// FORECAST — the second core screen. Cash + total savings over the horizon,
// horizon switch, balance-at-month lookup, lowest cash point, per-target ends.
import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../state/store';
import { useProjection } from '../hooks/useProjection';
import { gbp, type Scenario } from '../types';
import { Card, Section, Stat, Select } from '../components/ui';

const HORIZONS = [12, 24, 36];

export function Forecast() {
  const { plan } = useStore();
  const [horizon, setHorizon] = useState(plan.settings.projection_months_default || 24);
  const [scenarioId, setScenarioId] = useState<number | null>(null);
  const proj = useProjection(horizon, scenarioId);
  const [lookup, setLookup] = useState(Math.min(12, horizon));

  const data = useMemo(
    () => proj.points.map((p) => ({ month: p.month, Cash: Math.round(p.cash), Savings: Math.round(p.savingsTotal) })),
    [proj],
  );

  const at = proj.points.find((p) => p.month === lookup) ?? proj.points[proj.points.length - 1];
  const end = proj.points[proj.points.length - 1];

  return (
    <div className="mx-auto max-w-md p-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="px-1 text-2xl font-bold">Forecast</h1>
        <div className="flex gap-2">
          <Select
            value={scenarioId ?? ''}
            onChange={(e) => setScenarioId(e.target.value === '' ? null : Number(e.target.value))}
            className="w-36"
          >
            <option value="">Base plan</option>
            {plan.scenarios.map((s: Scenario) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {HORIZONS.map((h) => (
          <button
            key={h}
            onClick={() => {
              setHorizon(h);
              setLookup((l) => Math.min(l, h));
            }}
            className={`flex-1 rounded-xl py-2 text-sm font-medium ${
              horizon === h ? 'bg-accent text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {h} mo
          </button>
        ))}
      </div>

      <Card className="mb-4 p-3">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => gbp(Number(v))} width={60} />
            <Tooltip formatter={(v: number) => gbp(v)} labelFormatter={(l) => `Month ${l}`} />
            <Line type="monotone" dataKey="Cash" stroke="#2563eb" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Savings" stroke="#16a34a" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-1 flex justify-center gap-4 text-xs">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded bg-accent" />Cash</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded bg-good" />Total savings</span>
        </div>
      </Card>

      <Card className="mb-4 grid grid-cols-2 gap-y-4 p-4">
        <Stat label="End cash" value={gbp(end?.cash ?? 0)} sub={`month ${end?.month ?? 0}`} tone={(end?.cash ?? 0) >= 0 ? 'good' : 'bad'} />
        <Stat label="End savings" value={gbp(end?.savingsTotal ?? 0)} />
        <Stat
          label="Lowest cash"
          value={gbp(proj.lowestCash.value)}
          sub={`month ${proj.lowestCash.month}`}
          tone={proj.lowestCash.value >= 0 ? 'default' : 'bad'}
        />
        <Stat label="Net flow / mo" value={gbp(end ? end.netFlow : 0)} />
      </Card>

      <Section title="Balance at month">
        <Card className="p-4">
          <input
            type="range"
            min={1}
            max={horizon}
            value={lookup}
            onChange={(e) => setLookup(Number(e.target.value))}
            className="w-full"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm text-slate-500">Month {lookup}</span>
            <div className="text-right">
              <div className="text-lg font-bold tabular-nums">{gbp(at?.cash ?? 0)}</div>
              <div className="text-xs text-slate-400">savings {gbp(at?.savingsTotal ?? 0)}</div>
            </div>
          </div>
        </Card>
      </Section>

      <Section title="Per-target end balances">
        <Card>
          {proj.targets.length === 0 ? (
            <div className="p-4 text-sm text-slate-400">No savings targets.</div>
          ) : (
            proj.targets.map((t) => (
              <div key={t.targetId} className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 last:border-0">
                <span className="text-sm">{t.name}</span>
                <span className="font-medium tabular-nums">{gbp(t.endBalance)}</span>
              </div>
            ))
          )}
        </Card>
      </Section>
    </div>
  );
}

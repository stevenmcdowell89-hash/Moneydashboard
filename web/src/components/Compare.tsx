import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../state/store';
import { evaluatePlan, type PlanEvaluation } from '../hooks/useDashboard';
import { parsePayload } from '../lib/scenario';
import { formatYM, formatYMShort } from '../lib/calendar';
import { gbp } from '../types';

const COLORS = ['#0f172a', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed'];

interface Entry {
  key: string;
  name: string;
  color: string;
  ev: PlanEvaluation;
}

export function Compare() {
  const { plan, taxConfig } = useStore();
  const horizon = plan.settings.projection_months_default || 24;

  const options = useMemo(
    () => [{ key: 'base', name: 'Base plan' }, ...plan.scenarios.map((s) => ({ key: `s${s.id}`, name: s.name || 'Scenario' }))],
    [plan.scenarios],
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(['base', ...(plan.scenarios[0] ? [`s${plan.scenarios[0].id}`] : [])]),
  );

  const entries: Entry[] = useMemo(() => {
    const list: Entry[] = [];
    let i = 0;
    for (const opt of options) {
      if (!selected.has(opt.key)) continue;
      const ev =
        opt.key === 'base'
          ? evaluatePlan(plan, taxConfig, horizon)
          : evaluatePlan(parsePayload(plan.scenarios.find((s) => `s${s.id}` === opt.key)!.payload), taxConfig, horizon);
      list.push({ key: opt.key, name: opt.name, color: COLORS[i % COLORS.length], ev });
      i++;
    }
    return list;
  }, [options, selected, plan, taxConfig, horizon]);

  const data = useMemo(() => {
    const len = entries[0]?.ev.result.points.length ?? 0;
    const rows: Record<string, number | string>[] = [];
    for (let i = 0; i < len; i++) {
      const row: Record<string, number | string> = { label: formatYMShort(entries[0].ev.result.points[i].ym) };
      for (const e of entries) {
        row[`${e.key}_cash`] = Math.round(e.ev.result.points[i]?.cash ?? 0);
        row[`${e.key}_sav`] = Math.round(e.ev.result.points[i]?.savingsTotal ?? 0);
      }
      rows.push(row);
    }
    return rows;
  }, [entries]);

  // Union of targets by id across selected plans.
  const targetRows = useMemo(() => {
    const names = new Map<number, string>();
    for (const e of entries) for (const t of e.ev.targets) names.set(t.target.id, t.target.name || 'Goal');
    return [...names.entries()];
  }, [entries]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const metric = (e: Entry) => {
    const pts = e.ev.result.points;
    const end = pts[pts.length - 1];
    return {
      m1: e.ev.monthOne.leftToSpend,
      low: e.ev.result.lowestCash,
      endCash: end?.cash ?? 0,
      endSav: end?.savingsTotal ?? 0,
    };
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.key}
            onClick={() => toggle(o.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
              selected.has(o.key) ? 'bg-accent text-white ring-accent' : 'bg-white text-slate-500 ring-slate-200'
            }`}
          >
            {o.name}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-center text-sm text-slate-400 ring-1 ring-slate-200">Pick at least one to compare.</p>
      ) : (
        <>
          <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
                <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v) => gbp(Number(v))} />
                <Tooltip formatter={(v: number) => gbp(v)} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                {entries.map((e) => (
                  <Line key={`${e.key}c`} dataKey={`${e.key}_cash`} name={`${e.name} cash`} stroke={e.color} strokeWidth={2} dot={false} />
                ))}
                {entries.map((e) => (
                  <Line key={`${e.key}s`} dataKey={`${e.key}_sav`} name={`${e.name} savings`} stroke={e.color} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <p className="mt-1 text-center text-[10px] text-slate-400">Solid = cash · dashed = savings</p>
          </div>

          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full text-right text-xs tabular-nums">
              <thead className="text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Metric</th>
                  {entries.map((e) => (
                    <th key={e.key} className="px-3 py-2 font-semibold" style={{ color: e.color }}>{e.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-3 py-2 text-left text-slate-500">Free this month</td>
                  {entries.map((e) => <td key={e.key} className="px-3 py-2">{gbp(metric(e).m1)}</td>)}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-left text-slate-500">Lowest cash</td>
                  {entries.map((e) => {
                    const m = metric(e);
                    return <td key={e.key} className={`px-3 py-2 ${m.low.value < 0 ? 'text-bad' : ''}`}>{gbp(m.low.value)}<span className="block text-[10px] text-slate-400">{formatYMShort(m.low.ym)}</span></td>;
                  })}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-left text-slate-500">End cash</td>
                  {entries.map((e) => <td key={e.key} className="px-3 py-2 font-medium">{gbp(metric(e).endCash)}</td>)}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-left text-slate-500">End savings</td>
                  {entries.map((e) => <td key={e.key} className="px-3 py-2 text-good">{gbp(metric(e).endSav)}</td>)}
                </tr>
                {targetRows.map(([id, name]) => (
                  <tr key={id}>
                    <td className="px-3 py-2 text-left text-slate-500">{name} — hits</td>
                    {entries.map((e) => {
                      const st = e.ev.targets.find((t) => t.target.id === id);
                      return (
                        <td key={e.key} className={`px-3 py-2 ${st?.onTrack ? 'text-good' : 'text-warn'}`}>
                          {st ? (st.projectedHit ? formatYM(st.projectedHit) : 'never') : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

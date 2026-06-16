import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatYM, formatYMShort } from '../lib/calendar';
import { gbp, type ProjectionResult } from '../types';
import type { TargetStatus } from '../types';

const HORIZONS = [12, 24, 36];

export function ForecastCard({
  result,
  horizon,
  onHorizon,
  targets,
}: {
  result: ProjectionResult;
  horizon: number;
  onHorizon: (h: number) => void;
  targets: TargetStatus[];
}) {
  const data = useMemo(
    () =>
      result.points.map((p) => ({
        label: formatYMShort(p.ym),
        ym: p.ym,
        Cash: Math.round(p.cash),
        Savings: Math.round(p.savingsTotal),
      })),
    [result],
  );

  // Mark each on-track target's projected hit month on the axis.
  const hits = targets
    .filter((t) => t.projectedHit)
    .map((t) => ({ label: formatYMShort(t.projectedHit as string), name: t.target.name }));

  const end = result.points[result.points.length - 1];

  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500">Forecast</h2>
        <div className="flex gap-1 rounded-full bg-slate-100 p-0.5">
          {HORIZONS.map((h) => (
            <button
              key={h}
              onClick={() => onHorizon(h)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                horizon === h ? 'bg-white text-ink shadow-sm' : 'text-slate-500'
              }`}
            >
              {h === 12 ? '1y' : h === 24 ? '2y' : '3y'}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={210}>
        <AreaChart data={data} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="savFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
          <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v) => gbp(Number(v))} />
          <Tooltip
            formatter={(v: number) => gbp(v)}
            labelFormatter={(_l, payload) => {
              const ym = payload?.[0]?.payload?.ym as string | undefined;
              return ym ? formatYM(ym) : '';
            }}
            contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
          />
          <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="2 2" />
          {hits.map((h, i) => (
            <ReferenceLine key={i} x={h.label} stroke="#16a34a" strokeDasharray="4 3" />
          ))}
          <Area type="monotone" dataKey="Cash" stroke="#2563eb" strokeWidth={2.5} fill="url(#cashFill)" />
          <Area type="monotone" dataKey="Savings" stroke="#16a34a" strokeWidth={2} fill="url(#savFill)" />
        </AreaChart>
      </ResponsiveContainer>

      <div className="mt-2 flex items-center justify-between text-xs">
        <div className="flex gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded bg-accent" />Cash
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded bg-good" />Savings
          </span>
        </div>
        <div className="text-slate-500">
          end {end ? formatYMShort(end.ym) : ''}:{' '}
          <span className={`font-semibold ${(end?.cash ?? 0) >= 0 ? 'text-ink' : 'text-bad'}`}>{gbp(end?.cash ?? 0)}</span>
        </div>
      </div>
    </div>
  );
}

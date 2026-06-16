// Dashboard — all the Recharts visualisations for the planner (§8).
// Reads plan + taxConfig from the store, recomputes scenario projections with
// useMemo, and renders each chart in its own <Card>. Robust to empty plans.

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, EmptyState, Section, Select } from '../components/ui';
import {
  ChartFrame,
  MoneyTooltip,
  PALETTE,
  ProgressBar,
  TOKENS,
  axisMoney,
  colorAt,
  monthLabel,
} from '../components/charts';
import { useStore } from '../state/store';
import { normalizeFrequency, project, resolveScenario } from '../engine';
import { api } from '../api/client';
import { gbp } from '../types';
import type { ProjectionResult, Snapshot } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HORIZONS = [12, 24, 36] as const;

/** Stable, unique key for a scenario line (names may collide). */
const scenarioKey = (id: number) => `s${id}`;
const BASE_KEY = 'base';

interface ScenarioSeries {
  id: number | null;
  name: string;
  key: string;
  result: ProjectionResult;
  color: string;
}

/** Build one projection per scenario (base plan first) for the given horizon. */
function useScenarioProjections(horizon: number): ScenarioSeries[] {
  const { plan, taxConfig } = useStore();
  return useMemo(() => {
    const series: ScenarioSeries[] = [];
    // Base plan (scenarioId null) is always the first line.
    series.push({
      id: null,
      name: 'Base',
      key: BASE_KEY,
      result: project(resolveScenario(plan, null), horizon, taxConfig),
      color: TOKENS.accent,
    });
    plan.scenarios.forEach((sc, i) => {
      series.push({
        id: sc.id,
        name: sc.name || `Scenario ${sc.id}`,
        key: scenarioKey(sc.id),
        result: project(resolveScenario(plan, sc.id), horizon, taxConfig),
        // +1 so scenarios don't reuse the base's accent colour.
        color: colorAt(i + 1),
      });
    });
    return series;
  }, [plan, taxConfig, horizon]);
}

/** A row per month keyed by each series' stable key. */
type SeriesRow = { month: number } & Record<string, number>;

function mergeSeries(
  series: ScenarioSeries[],
  pick: (r: ProjectionResult, monthIdx: number) => number,
  horizon: number,
): SeriesRow[] {
  const rows: SeriesRow[] = [];
  for (let m = 0; m < horizon; m++) {
    const row: SeriesRow = { month: m + 1 };
    for (const s of series) {
      const pts = s.result.points;
      row[s.key] = m < pts.length ? pick(s.result, m) : 0;
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { plan, loading } = useStore();

  const [horizon, setHorizon] = useState<number>(
    plan.settings.projection_months_default || 24,
  );

  // Snapshots (over-time / actual trend). Fetched once on mount.
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [snapError, setSnapError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .getSnapshots()
      .then((rows) => {
        if (alive) setSnapshots(rows);
      })
      .catch((e: unknown) => {
        if (alive) setSnapError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const series = useScenarioProjections(horizon);
  const baseResult = series[0]?.result;

  // ---- chart datasets (memoised on the projections) ----------------------

  const cashRows = useMemo(
    () => mergeSeries(series, (r, m) => r.points[m].cash, horizon),
    [series, horizon],
  );
  const savingsRows = useMemo(
    () => mergeSeries(series, (r, m) => r.points[m].savingsTotal, horizon),
    [series, horizon],
  );

  // Per-target balance series from the base projection.
  const targetRows = useMemo<SeriesRow[]>(() => {
    const targets = baseResult?.targets ?? [];
    const rows: SeriesRow[] = [];
    for (let m = 0; m < horizon; m++) {
      const row: SeriesRow = { month: m + 1 };
      for (const t of targets) row[`t${t.targetId}`] = t.balances[m] ?? 0;
      rows.push(row);
    }
    return rows;
  }, [baseResult, horizon]);

  // Spend by category from active bills, monthly-normalised.
  const categoryData = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const b of plan.bills) {
      if (!b.active) continue;
      const cat = b.category?.trim() || 'Uncategorised';
      byCat.set(cat, (byCat.get(cat) ?? 0) + normalizeFrequency(b.amount, b.frequency));
    }
    return Array.from(byCat, ([name, value]) => ({ name, value })).sort(
      (a, b) => b.value - a.value,
    );
  }, [plan.bills]);

  // Monthly cashflow (income vs total outflow) — first 12 months of base.
  const cashflowData = useMemo(() => {
    const pts = baseResult?.points ?? [];
    return pts.slice(0, 12).map((p) => ({
      month: p.month,
      income: p.income,
      outflow: p.bills + p.events + p.contributions,
    }));
  }, [baseResult]);

  // Free cash by scenario = income - bills - contributions (month 1).
  const freeCashData = useMemo(
    () =>
      series.map((s) => {
        const p0 = s.result.points[0];
        const free = p0 ? p0.income - p0.bills - p0.contributions : 0;
        return { name: s.name, free, color: s.color };
      }),
    [series],
  );

  // Snapshot trend (m_cash_bal over taken_on dates).
  const snapshotData = useMemo(() => {
    if (!snapshots) return [];
    return [...snapshots]
      .filter((s) => s.m_cash_bal != null)
      .sort((a, b) => a.taken_on.localeCompare(b.taken_on))
      .map((s) => ({
        date: s.taken_on,
        cash: s.m_cash_bal ?? 0,
        savings: s.m_savings_total ?? 0,
        free: s.m_free_cash ?? 0,
      }));
  }, [snapshots]);

  // ---- derived flags ------------------------------------------------------

  const hasScenarios = plan.scenarios.length > 0;
  const hasBills = plan.bills.some((b) => b.active);
  const hasTargets = (baseResult?.targets.length ?? 0) > 0;
  const goalTargets = useMemo(
    () =>
      plan.savings_targets
        .filter((t) => t.target_amount != null)
        .map((t) => {
          const proj = baseResult?.targets.find((p) => p.targetId === t.id);
          return {
            id: t.id,
            name: t.name,
            current: proj?.endBalance ?? t.balance,
            target: t.target_amount ?? 0,
          };
        }),
    [plan.savings_targets, baseResult],
  );

  const planEmpty =
    plan.income.length === 0 &&
    plan.bills.length === 0 &&
    plan.savings_targets.length === 0 &&
    plan.scenarios.length === 0;

  if (loading) {
    return (
      <div className="p-4">
        <EmptyState title="Loading dashboard…" hint="Fetching your plan." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-3 sm:p-4">
      {/* Header + horizon selector */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">Dashboard</h1>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Horizon
          </label>
          <div className="w-28">
            <Select
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              aria-label="Projection horizon"
            >
              {HORIZONS.map((h) => (
                <option key={h} value={h}>
                  {h} months
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {planEmpty && (
        <Section>
          <EmptyState
            title="Your plan is empty"
            hint="Add income, bills and savings targets to see projections and charts here."
          />
        </Section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 1. Cash over horizon by scenario */}
        <Card>
          <ChartFrame
            title="Cash over horizon"
            subtitle="Running cash balance, by scenario"
          >
            <LineChart data={cashRows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="month"
                tickFormatter={monthLabel}
                tick={{ fontSize: 11 }}
                stroke="#94a3b8"
              />
              <YAxis tickFormatter={axisMoney} tick={{ fontSize: 11 }} width={56} stroke="#94a3b8" />
              <Tooltip content={<MoneyTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ChartFrame>
        </Card>

        {/* 2. Total savings over horizon by scenario */}
        <Card>
          <ChartFrame
            title="Total savings over horizon"
            subtitle="Sum of all target balances, by scenario"
          >
            <LineChart data={savingsRows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="month"
                tickFormatter={monthLabel}
                tick={{ fontSize: 11 }}
                stroke="#94a3b8"
              />
              <YAxis tickFormatter={axisMoney} tick={{ fontSize: 11 }} width={56} stroke="#94a3b8" />
              <Tooltip content={<MoneyTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ChartFrame>
        </Card>

        {/* 3. Each savings target balance + goal progress */}
        <Card>
          {hasTargets ? (
            <>
              <ChartFrame
                title="Savings targets"
                subtitle="Projected balance per target (base plan)"
              >
                <LineChart data={targetRows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={monthLabel}
                    tick={{ fontSize: 11 }}
                    stroke="#94a3b8"
                  />
                  <YAxis
                    tickFormatter={axisMoney}
                    tick={{ fontSize: 11 }}
                    width={56}
                    stroke="#94a3b8"
                  />
                  <Tooltip content={<MoneyTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {(baseResult?.targets ?? []).map((t, i) => (
                    <Line
                      key={t.targetId}
                      type="monotone"
                      dataKey={`t${t.targetId}`}
                      name={t.name}
                      stroke={colorAt(i)}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ChartFrame>
              {goalTargets.length > 0 && (
                <div className="border-t border-slate-100 px-4 py-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Goal progress
                  </p>
                  <div className="flex flex-col gap-2">
                    {goalTargets.map((g) => (
                      <ProgressBar
                        key={g.id}
                        label={g.name}
                        current={g.current}
                        target={g.target}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-4">
              <ChartFrameTitle title="Savings targets" />
              <EmptyState
                title="No savings targets"
                hint="Add a savings target to track its balance and goal progress."
              />
            </div>
          )}
        </Card>

        {/* 4. Spend by category */}
        <Card>
          {hasBills && categoryData.length > 0 ? (
            <ChartFrame title="Spend by category" subtitle="Monthly-normalised active bills">
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {categoryData.map((entry, i) => (
                    <Cell key={entry.name} fill={colorAt(i)} />
                  ))}
                </Pie>
                <Tooltip content={<MoneyTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ChartFrame>
          ) : (
            <div className="p-4">
              <ChartFrameTitle title="Spend by category" />
              <EmptyState
                title="No active bills"
                hint="Add some bills to see how your spending breaks down by category."
              />
            </div>
          )}
        </Card>

        {/* 5. Monthly cashflow */}
        <Card>
          {cashflowData.length > 0 ? (
            <ChartFrame
              title="Monthly cashflow"
              subtitle="Income vs outflow — first 12 months"
            >
              <BarChart data={cashflowData} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={monthLabel}
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                />
                <YAxis
                  tickFormatter={axisMoney}
                  tick={{ fontSize: 11 }}
                  width={56}
                  stroke="#94a3b8"
                />
                <Tooltip content={<MoneyTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="income" name="Income" fill={TOKENS.good} radius={[3, 3, 0, 0]} />
                <Bar dataKey="outflow" name="Outflow" fill={TOKENS.bad} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartFrame>
          ) : (
            <div className="p-4">
              <ChartFrameTitle title="Monthly cashflow" />
              <EmptyState title="No projection yet" hint="Add income or bills to see cashflow." />
            </div>
          )}
        </Card>

        {/* 6. Free cash by scenario */}
        <Card>
          {hasScenarios ? (
            <ChartFrame
              title="Free cash by scenario"
              subtitle="Income − bills − contributions (month 1)"
            >
              <BarChart data={freeCashData} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" interval={0} />
                <YAxis
                  tickFormatter={axisMoney}
                  tick={{ fontSize: 11 }}
                  width={56}
                  stroke="#94a3b8"
                />
                <Tooltip content={<MoneyTooltip labelFormatter={(l) => String(l)} />} />
                <Bar dataKey="free" name="Free cash" radius={[3, 3, 0, 0]}>
                  {freeCashData.map((d) => (
                    <Cell key={d.name} fill={d.free >= 0 ? TOKENS.accent : TOKENS.bad} />
                  ))}
                </Bar>
              </BarChart>
            </ChartFrame>
          ) : (
            <div className="p-4">
              <ChartFrameTitle title="Free cash by scenario" />
              <EmptyState
                title="No scenarios"
                hint="Create scenarios to compare their month-1 free cash."
              />
            </div>
          )}
        </Card>

        {/* 7. Actual snapshot trend over real months */}
        <Card className="lg:col-span-2">
          {snapshotData.length > 0 ? (
            <ChartFrame
              title="Actual trend"
              subtitle="Captured snapshots over time"
              height={260}
            >
              <LineChart data={snapshotData} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis
                  tickFormatter={axisMoney}
                  tick={{ fontSize: 11 }}
                  width={56}
                  stroke="#94a3b8"
                />
                <Tooltip content={<MoneyTooltip labelFormatter={(l) => String(l)} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="cash"
                  name="Cash balance"
                  stroke={TOKENS.accent}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="savings"
                  name="Savings total"
                  stroke={TOKENS.good}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="free"
                  name="Free cash"
                  stroke={TOKENS.warn}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ChartFrame>
          ) : (
            <div className="p-4">
              <ChartFrameTitle title="Actual trend" />
              <EmptyState
                title={snapError ? 'Could not load snapshots' : 'No snapshots yet'}
                hint={
                  snapError ??
                  'Capture a snapshot to start tracking your actuals against the plan over time.'
                }
              />
            </div>
          )}
        </Card>
      </div>

      {/* Small palette legend reference so unused tokens are exercised. */}
      <div className="sr-only" aria-hidden>
        {PALETTE.map((c) => (
          <span key={c} style={{ color: c }}>
            {gbp(0)}
          </span>
        ))}
      </div>
    </div>
  );
}

// A bare title used in the empty-state branches (mirrors ChartFrame's heading).
function ChartFrameTitle({ title }: { title: string }) {
  return <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>;
}

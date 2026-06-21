// Scenarios screen — CRUD over what-if scenarios, adjustment/target editors, and
// a side-by-side compare chart. Single-user budgeting app. (§8)
//
// All mutations go through store.update(draft => newPlanState) so persistence is
// automatic and projections redraw live.

import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  MoneyInput,
  NumberInput,
  Section,
  Select,
  Slider,
  Stat,
  TextInput,
} from '../components/ui';
import {
  monthGoalHit,
  monthlyNetIncome,
  normalizeFrequency,
  project,
  requiredContribution,
  resolveScenario,
} from '../engine';
import { nextTempId, useStore } from '../state/store';
import {
  gbp,
  gbp2,
  type Bill,
  type Income,
  type ItemType,
  type PlanEvent,
  type PlanState,
  type SavingsTarget,
  type Scenario,
  type ScenarioOverride,
  type ScenarioType,
  type TaxConfig,
} from '../types';

// ---------------------------------------------------------------------------
// Helpers (pure)
// ---------------------------------------------------------------------------

/** Base monthly value of a plan line, by item type. */
function baseMonthly(
  itemType: ItemType,
  income: Income | undefined,
  bill: Bill | undefined,
  savings: SavingsTarget | undefined,
  taxConfig: TaxConfig | null,
): number {
  if (itemType === 'income' && income) return monthlyNetIncome(income, taxConfig);
  if (itemType === 'bill' && bill) return normalizeFrequency(bill.amount, bill.frequency);
  if (itemType === 'savings' && savings) return savings.monthly_contribution || 0;
  return 0;
}

/** Find an existing override row for a line within a scenario. */
function findOverride(
  overrides: ScenarioOverride[],
  scenarioId: number,
  itemType: ItemType,
  itemId: number,
): ScenarioOverride | undefined {
  return overrides.find(
    (o) => o.scenario_id === scenarioId && o.item_type === itemType && o.item_id === itemId,
  );
}

/** Sensible slider max: ~2x base, floored at a usable minimum. */
const sliderMax = (base: number): number => Math.max(100, Math.ceil((base * 2) / 10) * 10);

const COMPARE_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777'];

const BASE_KEY = 'base';

// ---------------------------------------------------------------------------
// Override row control (shared by adjustment + target editors)
// ---------------------------------------------------------------------------

function OverrideRow({
  label,
  sub,
  base,
  itemType,
  itemId,
  scenarioId,
}: {
  label: string;
  sub?: string;
  base: number;
  itemType: ItemType;
  itemId: number;
  scenarioId: number;
}) {
  const { plan, update } = useStore();
  const existing = findOverride(plan.scenario_overrides, scenarioId, itemType, itemId);
  const hasOverride = existing !== undefined && existing.override_amount !== null;
  const current = hasOverride ? (existing!.override_amount as number) : base;

  const setOverride = (amount: number) => {
    update((draft): PlanState => {
      const others = draft.scenario_overrides.filter(
        (o) => !(o.scenario_id === scenarioId && o.item_type === itemType && o.item_id === itemId),
      );
      const row: ScenarioOverride = {
        id: existing?.id ?? nextTempId(),
        scenario_id: scenarioId,
        item_type: itemType,
        item_id: itemId,
        override_amount: amount,
      };
      return { ...draft, scenario_overrides: [...others, row] };
    });
  };

  const resetOverride = () => {
    update((draft): PlanState => ({
      ...draft,
      scenario_overrides: draft.scenario_overrides.filter(
        (o) => !(o.scenario_id === scenarioId && o.item_type === itemType && o.item_id === itemId),
      ),
    }));
  };

  const max = sliderMax(base);
  const step = max > 2000 ? 50 : max > 400 ? 10 : 5;

  return (
    <div className="border-t border-slate-100 px-3 py-3 first:border-t-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink">{label}</div>
          <div className="text-xs text-slate-400">
            base {gbp2(base)}/mo{sub ? ` · ${sub}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasOverride ? (
            current === 0 ? (
              <Badge tone="bad">cancelled</Badge>
            ) : (
              <Badge tone="warn">override</Badge>
            )
          ) : (
            <Badge>unchanged</Badge>
          )}
          <Button size="sm" variant="ghost" onClick={resetOverride} disabled={!hasOverride}>
            reset
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-32 shrink-0">
          <MoneyInput value={hasOverride ? current : null} placeholder={String(Math.round(base))} onChange={setOverride} />
        </div>
        <div className="flex-1">
          <Slider value={current} min={0} max={max} step={step} onChange={setOverride} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Events editor (events tagged to a scenario)
// ---------------------------------------------------------------------------

function ScenarioEvents({ scenarioId }: { scenarioId: number }) {
  const { plan, update } = useStore();
  const tag = String(scenarioId);
  const mine = plan.events.filter((e) => e.applies_to === tag);
  const always = plan.events.filter((e) => e.applies_to === 'all');

  const addEvent = () => {
    update((draft): PlanState => {
      const ev: PlanEvent = {
        id: nextTempId(),
        name: 'New event',
        total_cost: 0,
        start_month: 1,
        duration_months: 1,
        applies_to: tag,
      };
      return { ...draft, events: [...draft.events, ev] };
    });
  };

  const patchEvent = (id: number, patch: Partial<PlanEvent>) => {
    update((draft): PlanState => ({
      ...draft,
      events: draft.events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  };

  const removeEvent = (id: number) => {
    update((draft): PlanState => ({ ...draft, events: draft.events.filter((e) => e.id !== id) }));
  };

  return (
    <Section title="Events" action={<Button size="sm" onClick={addEvent}>+ Event</Button>}>
      <Card className="divide-y divide-slate-100">
        {mine.length === 0 && always.length === 0 && (
          <div className="px-3 py-4 text-sm text-slate-400">No events tagged to this scenario.</div>
        )}
        {mine.map((e) => (
          <div key={e.id} className="space-y-2 px-3 py-3">
            <div className="flex items-center gap-2">
              <TextInput
                value={e.name}
                onChange={(ev) => patchEvent(e.id, { name: ev.target.value })}
                placeholder="Event name"
              />
              <Button size="sm" variant="danger" onClick={() => removeEvent(e.id)}>
                Delete
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs text-slate-500">
                Total cost
                <MoneyInput value={e.total_cost} onChange={(n) => patchEvent(e.id, { total_cost: n })} />
              </label>
              <label className="text-xs text-slate-500">
                Start month
                <NumberInput
                  value={e.start_month}
                  onChange={(n) => patchEvent(e.id, { start_month: Math.max(1, n ?? 1) })}
                  integer
                  min={1}
                />
              </label>
              <label className="text-xs text-slate-500">
                Duration (mo)
                <NumberInput
                  value={e.duration_months}
                  onChange={(n) => patchEvent(e.id, { duration_months: Math.max(1, n ?? 1) })}
                  integer
                  min={1}
                />
              </label>
            </div>
          </div>
        ))}
        {always.map((e) => (
          <div key={e.id} className="flex items-center justify-between px-3 py-3 text-sm">
            <div>
              <div className="font-medium text-slate-600">{e.name}</div>
              <div className="text-xs text-slate-400">
                {gbp(e.total_cost)} · month {e.start_month} for {e.duration_months}mo
              </div>
            </div>
            <Badge>always applies</Badge>
          </div>
        ))}
      </Card>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Adjustment editor
// ---------------------------------------------------------------------------

function AdjustmentEditor({ scenario }: { scenario: Scenario }) {
  const { plan, taxConfig } = useStore();
  const hasLines = plan.income.length || plan.bills.length || plan.savings_targets.length;

  return (
    <div className="space-y-4">
      {!hasLines && (
        <EmptyState title="No lines to adjust" hint="Add income, bills or savings targets first." />
      )}

      {plan.income.length > 0 && (
        <Section title="Income">
          <Card>
            {plan.income.map((i) => (
              <OverrideRow
                key={i.id}
                label={i.name}
                sub={i.entry_mode === 'gross' ? 'gross-entry (net shown)' : i.frequency}
                base={baseMonthly('income', i, undefined, undefined, taxConfig)}
                itemType="income"
                itemId={i.id}
                scenarioId={scenario.id}
              />
            ))}
          </Card>
        </Section>
      )}

      {plan.bills.length > 0 && (
        <Section title="Bills">
          <Card>
            {plan.bills.map((b) => (
              <OverrideRow
                key={b.id}
                label={b.name}
                sub={b.frequency}
                base={baseMonthly('bill', undefined, b, undefined, taxConfig)}
                itemType="bill"
                itemId={b.id}
                scenarioId={scenario.id}
              />
            ))}
          </Card>
        </Section>
      )}

      {plan.savings_targets.length > 0 && (
        <Section title="Savings contributions">
          <Card>
            {plan.savings_targets.map((t) => (
              <OverrideRow
                key={t.id}
                label={t.name}
                sub="monthly contribution"
                base={baseMonthly('savings', undefined, undefined, t, taxConfig)}
                itemType="savings"
                itemId={t.id}
                scenarioId={scenario.id}
              />
            ))}
          </Card>
        </Section>
      )}

      <ScenarioEvents scenarioId={scenario.id} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Target editor ("save £X by date")
// ---------------------------------------------------------------------------

function TargetEditor({ scenario, horizon }: { scenario: Scenario; horizon: number }) {
  const { plan, taxConfig, update } = useStore();
  const target = plan.savings_targets.find((t) => t.id === scenario.target_id);

  const projection = useMemo(() => {
    const resolved = resolveScenario(plan, scenario.id);
    return project(resolved, horizon, taxConfig);
  }, [plan, scenario.id, horizon, taxConfig]);

  if (!target) {
    return (
      <EmptyState
        title="No linked savings target"
        hint="This target scenario is missing its savings_target. Try recreating it."
      />
    );
  }

  const patchTarget = (patch: Partial<SavingsTarget>) => {
    update((draft): PlanState => ({
      ...draft,
      savings_targets: draft.savings_targets.map((t) => (t.id === target.id ? { ...t, ...patch } : t)),
    }));
  };

  const monthsRemaining = target.target_month ?? horizon;
  const required = requiredContribution(target, monthsRemaining);
  const hitMonth = monthGoalHit(target, horizon);
  const onTrack = hitMonth !== null && (target.target_month == null || hitMonth <= target.target_month);

  // Projected end balance of THIS target from the live projection.
  const targetProj = projection.targets.find((t) => t.targetId === target.id);
  const projectedEnd = targetProj?.endBalance ?? target.balance;
  const goal = target.target_amount ?? 0;
  const month1Free = projection.points[0]?.netFlow ?? 0;
  const shortfall = goal - projectedEnd;

  return (
    <div className="space-y-4">
      <Section title={`Goal — ${target.name}`}>
        <Card className="space-y-3 p-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">
              Target amount
              <MoneyInput value={target.target_amount} onChange={(n) => patchTarget({ target_amount: n })} />
            </label>
            <label className="text-xs text-slate-500">
              Target month (from now)
              <NumberInput
                value={target.target_month}
                placeholder={String(horizon)}
                onChange={(n) => patchTarget({ target_month: n == null ? null : Math.max(1, n) })}
                integer
                min={1}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Need / month" value={gbp2(required)} sub={`over ${monthsRemaining} mo`} />
            <Stat
              label="Current / month"
              value={gbp2(target.monthly_contribution)}
              tone={target.monthly_contribution >= required ? 'good' : 'warn'}
            />
            <Stat
              label="Status"
              value={onTrack ? `Month ${hitMonth}` : 'Short'}
              tone={onTrack ? 'good' : 'bad'}
              sub={onTrack ? 'on track' : `short by ${gbp(Math.max(0, shortfall))}`}
            />
          </div>
          <label className="block text-xs text-slate-500">
            Monthly contribution
            <div className="mt-1 flex items-center gap-3">
              <div className="w-32 shrink-0">
                <MoneyInput
                  value={target.monthly_contribution}
                  onChange={(n) => patchTarget({ monthly_contribution: n })}
                />
              </div>
              <div className="flex-1">
                <Slider
                  value={target.monthly_contribution}
                  min={0}
                  max={sliderMax(Math.max(required, target.monthly_contribution))}
                  step={5}
                  onChange={(n) => patchTarget({ monthly_contribution: n })}
                />
              </div>
            </div>
          </label>
        </Card>
      </Section>

      <Section title="Free up cash">
        <div className="mb-2 px-1">
          <Stat
            label="Month-1 free cash (this scenario)"
            value={gbp2(month1Free)}
            tone={month1Free >= 0 ? 'good' : 'bad'}
            sub={`projected target end ${gbp(projectedEnd)} vs goal ${gbp(goal)}`}
          />
        </div>
        {plan.income.length === 0 && plan.bills.length === 0 && plan.savings_targets.length <= 1 ? (
          <EmptyState title="Nothing else to adjust" hint="Add other income, bills or savings to free up cash." />
        ) : (
          <>
            {plan.income.length > 0 && (
              <Card className="mb-3">
                <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Income</div>
                {plan.income.map((i) => (
                  <OverrideRow
                    key={i.id}
                    label={i.name}
                    sub={i.entry_mode === 'gross' ? 'gross-entry (net shown)' : i.frequency}
                    base={baseMonthly('income', i, undefined, undefined, taxConfig)}
                    itemType="income"
                    itemId={i.id}
                    scenarioId={scenario.id}
                  />
                ))}
              </Card>
            )}
            {plan.bills.length > 0 && (
              <Card className="mb-3">
                <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Bills</div>
                {plan.bills.map((b) => (
                  <OverrideRow
                    key={b.id}
                    label={b.name}
                    sub={b.frequency}
                    base={baseMonthly('bill', undefined, b, undefined, taxConfig)}
                    itemType="bill"
                    itemId={b.id}
                    scenarioId={scenario.id}
                  />
                ))}
              </Card>
            )}
            {plan.savings_targets.filter((t) => t.id !== target.id).length > 0 && (
              <Card>
                <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Other savings
                </div>
                {plan.savings_targets
                  .filter((t) => t.id !== target.id)
                  .map((t) => (
                    <OverrideRow
                      key={t.id}
                      label={t.name}
                      sub="monthly contribution"
                      base={baseMonthly('savings', undefined, undefined, t, taxConfig)}
                      itemType="savings"
                      itemId={t.id}
                      scenarioId={scenario.id}
                    />
                  ))}
              </Card>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

interface CompareEntry {
  key: string;
  name: string;
  scenarioId: number | null;
}

function Compare({ horizon }: { horizon: number }) {
  const { plan, taxConfig } = useStore();
  const [selected, setSelected] = useState<Set<string>>(() => new Set<string>([BASE_KEY]));

  const entries: CompareEntry[] = useMemo(
    () => [
      { key: BASE_KEY, name: 'Base', scenarioId: null },
      ...plan.scenarios.map((s) => ({ key: String(s.id), name: s.name, scenarioId: s.id })),
    ],
    [plan.scenarios],
  );

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const chosen = useMemo(() => entries.filter((e) => selected.has(e.key)), [entries, selected]);

  const computed = useMemo(
    () =>
      chosen.map((e) => {
        const resolved = resolveScenario(plan, e.scenarioId);
        const result = project(resolved, horizon, taxConfig);
        return { entry: e, result };
      }),
    [chosen, plan, horizon, taxConfig],
  );

  // Build chart rows: one row per month, a `cash_<key>` field per scenario.
  const chartData = useMemo(() => {
    const rows: Array<Record<string, number>> = [];
    for (let m = 1; m <= horizon; m++) {
      const row: Record<string, number> = { month: m };
      for (const c of computed) {
        row[`cash_${c.entry.key}`] = c.result.points[m - 1]?.cash ?? 0;
      }
      rows.push(row);
    }
    return rows;
  }, [computed, horizon]);

  return (
    <div className="space-y-4">
      <Section title="Compare scenarios">
        <Card className="p-3">
          <div className="flex flex-wrap gap-2">
            {entries.map((e) => {
              const on = selected.has(e.key);
              return (
                <button
                  key={e.key}
                  onClick={() => toggle(e.key)}
                  className={`rounded-full px-3 py-1 text-sm font-medium ring-1 transition ${
                    on ? 'bg-accent text-white ring-accent' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {e.name}
                </button>
              );
            })}
          </div>
          {selected.size < 2 && (
            <p className="mt-2 text-xs text-slate-400">Select at least two (including Base) to compare.</p>
          )}
        </Card>
      </Section>

      {computed.length >= 1 && (
        <Card className="p-3">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v: number) => gbp(v)} width={64} />
                <Tooltip
                  formatter={(v: number, name: string) => [gbp2(v), name]}
                  labelFormatter={(l) => `Month ${l}`}
                />
                {computed.map((c, idx) => (
                  <Line
                    key={c.entry.key}
                    type="monotone"
                    dataKey={`cash_${c.entry.key}`}
                    name={c.entry.name}
                    stroke={COMPARE_COLORS[idx % COMPARE_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {computed.length >= 1 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 font-semibold">Scenario</th>
                <th className="px-3 py-2 text-right font-semibold">Month-1 free</th>
                <th className="px-3 py-2 text-right font-semibold">Lowest cash</th>
                <th className="px-3 py-2 text-right font-semibold">End cash</th>
                <th className="px-3 py-2 text-right font-semibold">End savings</th>
              </tr>
            </thead>
            <tbody>
              {computed.map((c, idx) => {
                const pts = c.result.points;
                const m1 = pts[0]?.netFlow ?? 0;
                const endCash = pts[pts.length - 1]?.cash ?? 0;
                const endSavings = pts[pts.length - 1]?.savingsTotal ?? 0;
                return (
                  <tr key={c.entry.key} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: COMPARE_COLORS[idx % COMPARE_COLORS.length] }}
                        />
                        {c.entry.name}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${m1 < 0 ? 'text-bad' : ''}`}>{gbp(m1)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${c.result.lowestCash.value < 0 ? 'text-bad' : ''}`}>
                      {gbp(c.result.lowestCash.value)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{gbp(endCash)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{gbp(endSavings)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New scenario modal
// ---------------------------------------------------------------------------

function NewScenarioModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, type: ScenarioType, targetMode: 'new' | number) => void;
}) {
  const { plan } = useStore();
  const [name, setName] = useState('');
  const [type, setType] = useState<ScenarioType>('adjustment');
  const [targetMode, setTargetMode] = useState<'new' | number>('new');

  const reset = () => {
    setName('');
    setType('adjustment');
    setTargetMode('new');
  };

  const submit = () => {
    const trimmed = name.trim() || (type === 'target' ? 'Savings goal' : 'New scenario');
    onCreate(trimmed, type, targetMode);
    reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="New scenario">
      <div className="space-y-3">
        <label className="block text-xs text-slate-500">
          Name
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New car" />
        </label>
        <label className="block text-xs text-slate-500">
          Type
          <Select value={type} onChange={(e) => setType(e.target.value as ScenarioType)}>
            <option value="adjustment">Adjustment (what-if tweaks)</option>
            <option value="target">Target (save £X by date)</option>
          </Select>
        </label>
        {type === 'target' && (
          <label className="block text-xs text-slate-500">
            Savings target
            <Select
              value={targetMode === 'new' ? 'new' : String(targetMode)}
              onChange={(e) => setTargetMode(e.target.value === 'new' ? 'new' : Number(e.target.value))}
            >
              <option value="new">Create a new ring-fenced target</option>
              {plan.savings_targets.map((t) => (
                <option key={t.id} value={t.id}>
                  Use existing: {t.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function Scenarios() {
  const { plan, update } = useStore();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [horizon, setHorizon] = useState<number>(plan.settings.projection_months_default || 24);
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<'edit' | 'compare'>('edit');

  const selected = plan.scenarios.find((s) => s.id === selectedId) ?? null;

  const createScenario = (name: string, type: ScenarioType, targetMode: 'new' | number) => {
    const scenarioId = nextTempId();
    update((draft): PlanState => {
      let savings = draft.savings_targets;
      let targetId: number | null = null;

      if (type === 'target') {
        if (targetMode === 'new') {
          const newTarget: SavingsTarget = {
            id: nextTempId(),
            name: `${name} fund`,
            balance: 0,
            monthly_contribution: 0,
            annual_rate: 0,
            target_amount: null,
            target_month: null,
            ring_fenced: true,
          };
          savings = [...draft.savings_targets, newTarget];
          targetId = newTarget.id;
        } else {
          targetId = targetMode;
        }
      }

      const scenario: Scenario = {
        id: scenarioId,
        name,
        type,
        target_id: targetId,
        created_at: new Date().toISOString(),
      };

      return { ...draft, savings_targets: savings, scenarios: [...draft.scenarios, scenario] };
    });
    setSelectedId(scenarioId);
    setTab('edit');
  };

  const deleteScenario = (s: Scenario) => {
    const tag = String(s.id);
    update((draft): PlanState => ({
      ...draft,
      scenarios: draft.scenarios.filter((x) => x.id !== s.id),
      scenario_overrides: draft.scenario_overrides.filter((o) => o.scenario_id !== s.id),
      events: draft.events.filter((e) => e.applies_to !== tag),
    }));
    if (selectedId === s.id) setSelectedId(null);
  };

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Scenarios</h1>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Horizon</label>
          <div className="w-24">
            <Select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              <option value={12}>12 mo</option>
              <option value={24}>24 mo</option>
              <option value={36}>36 mo</option>
            </Select>
          </div>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <Button variant={tab === 'edit' ? 'primary' : 'subtle'} size="sm" onClick={() => setTab('edit')}>
          Edit
        </Button>
        <Button variant={tab === 'compare' ? 'primary' : 'subtle'} size="sm" onClick={() => setTab('compare')}>
          Compare
        </Button>
      </div>

      {tab === 'compare' ? (
        <Compare horizon={horizon} />
      ) : (
        <>
          <Section
            title="Your scenarios"
            action={<Button size="sm" onClick={() => setModalOpen(true)}>+ New scenario</Button>}
          >
            {plan.scenarios.length === 0 ? (
              <EmptyState
                title="No scenarios yet"
                hint="Create a what-if adjustment or a savings target to model your options."
                action={<Button size="sm" onClick={() => setModalOpen(true)}>+ New scenario</Button>}
              />
            ) : (
              <div className="space-y-2">
                {plan.scenarios.map((s) => (
                  <Card
                    key={s.id}
                    className={`flex items-center justify-between p-3 ${
                      selectedId === s.id ? 'ring-2 ring-accent' : ''
                    }`}
                  >
                    <button className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(s.id)}>
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-ink">{s.name}</span>
                        <Badge tone={s.type === 'target' ? 'good' : 'default'}>{s.type}</Badge>
                      </div>
                      <div className="text-xs text-slate-400">
                        {new Date(s.created_at).toLocaleDateString('en-GB')}
                      </div>
                    </button>
                    <Button size="sm" variant="danger" onClick={() => deleteScenario(s)}>
                      Delete
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </Section>

          {selected && (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2 px-1">
                <h2 className="text-lg font-bold">{selected.name}</h2>
                <Badge tone={selected.type === 'target' ? 'good' : 'default'}>{selected.type}</Badge>
              </div>
              {selected.type === 'adjustment' ? (
                <AdjustmentEditor scenario={selected} />
              ) : (
                <TargetEditor scenario={selected} horizon={horizon} />
              )}
            </div>
          )}
        </>
      )}

      <NewScenarioModal open={modalOpen} onClose={() => setModalOpen(false)} onCreate={createScenario} />
    </div>
  );
}

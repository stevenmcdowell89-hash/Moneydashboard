import { useStore, nextTempId } from '../state/store';
import { monthlyBillAmount, monthlyNetIncome } from '../engine';
import { gbp, type Scenario } from '../types';
import { type Draft, draftKey } from '../hooks/useDashboard';
import { Button, Slider } from './ui';

function Line({
  label,
  badge,
  base,
  k,
  draft,
  setVal,
}: {
  label: string;
  badge?: string;
  base: number;
  k: string;
  draft: Draft;
  setVal: (k: string, v: number) => void;
}) {
  const val = draft.get(k) ?? base;
  const max = Math.max(Math.ceil(base * 2), 100);
  const changed = draft.has(k) && val !== base;
  return (
    <div className="px-1 py-2">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="truncate">
          {label || 'Untitled'}
          {badge && <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{badge}</span>}
        </span>
        <span className={`tabular-nums ${changed ? 'font-semibold text-accent' : 'text-slate-500'}`}>
          {gbp(val)}
          {changed && <span className="ml-1 text-xs text-slate-400">was {gbp(base)}</span>}
        </span>
      </div>
      <Slider value={Math.min(val, max)} min={0} max={max} step={Math.max(1, Math.round(max / 100))} onChange={(v) => setVal(k, v)} />
    </div>
  );
}

export function WhatIfPanel({
  draft,
  setDraft,
  onClose,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onClose: () => void;
}) {
  const { plan, taxConfig, update } = useStore();

  const setVal = (k: string, v: number) => {
    const next = new Map(draft);
    next.set(k, v);
    setDraft(next);
  };

  const reset = () => setDraft(new Map());

  const loadScenario = (sc: Scenario) => {
    const next: Draft = new Map();
    for (const o of plan.scenario_overrides) {
      if (o.scenario_id === sc.id && o.override_amount != null) {
        next.set(`${o.item_type}:${o.item_id}`, o.override_amount);
      }
    }
    setDraft(next);
  };

  const saveScenario = () => {
    if (draft.size === 0) return;
    const name = window.prompt('Name this what-if', 'Tighter budget')?.trim();
    if (!name) return;
    const sid = nextTempId();
    const overrides = [...draft.entries()].map(([k, v]) => {
      const [item_type, item_id] = k.split(':');
      return {
        id: nextTempId(),
        scenario_id: sid,
        item_type: item_type as 'income' | 'bill',
        item_id: Number(item_id),
        override_amount: v,
      };
    });
    update((d) => ({
      ...d,
      scenarios: [...d.scenarios, { id: sid, name, type: 'adjustment', target_id: null, created_at: new Date().toISOString() }],
      scenario_overrides: [...d.scenario_overrides, ...overrides],
    }));
    onClose();
  };

  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-600">What-if — drag to explore</h2>
        <button onClick={onClose} className="text-sm font-medium text-slate-400">Done</button>
      </div>

      {plan.scenarios.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {plan.scenarios.map((s) => (
            <button key={s.id} onClick={() => loadScenario(s)} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200">
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {plan.income.filter((i) => i.active).map((i) => (
          <Line key={`i${i.id}`} label={i.name} badge="income" base={monthlyNetIncome(i, taxConfig)} k={draftKey('income', i.id)} draft={draft} setVal={setVal} />
        ))}
        {plan.bills.filter((b) => b.active).map((b) => (
          <Line key={`b${b.id}`} label={b.name} badge={b.is_savings ? 'saving' : undefined} base={monthlyBillAmount(b)} k={draftKey('bill', b.id)} draft={draft} setVal={setVal} />
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={saveScenario} disabled={draft.size === 0}>Save as scenario</Button>
        <Button variant="subtle" onClick={reset} disabled={draft.size === 0}>Reset</Button>
      </div>
    </div>
  );
}

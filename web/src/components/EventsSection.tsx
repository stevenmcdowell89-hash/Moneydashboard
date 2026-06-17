import { useState } from 'react';
import { nextTempId } from '../state/store';
import { usePlanScope } from '../state/scope';
import { addMonths, currentYM, formatYMShort, makeYM, parseYM, MONTHS_LONG } from '../lib/calendar';
import { gbp, type PlanEvent } from '../types';
import { Button, MoneyInput, NumberInput, Select, TextInput } from './ui';

function EventEditor({ ev, onClose }: { ev: PlanEvent; onClose: () => void }) {
  const { update } = usePlanScope();
  const { y, m } = parseYM(ev.start_ym || currentYM());
  const patch = (p: Partial<PlanEvent>) =>
    update((d) => ({ ...d, events: d.events.map((e) => (e.id === ev.id ? { ...e, ...p } : e)) }));
  const remove = () => {
    update((d) => ({ ...d, events: d.events.filter((e) => e.id !== ev.id) }));
    onClose();
  };
  const years = [y, y + 1, y + 2, y + 3, y + 4];

  return (
    <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Name</span>
        <TextInput value={ev.name} onChange={(e) => patch({ name: e.target.value })} placeholder="New boiler" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Total cost</span>
          <MoneyInput value={ev.total_cost} onChange={(n) => patch({ total_cost: n })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Spread over (months)</span>
          <NumberInput value={ev.duration_months} onChange={(n) => patch({ duration_months: Math.max(1, n) })} placeholder="1" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">From month</span>
          <Select value={m} onChange={(e) => patch({ start_ym: makeYM(y, Number(e.target.value)) })}>
            {MONTHS_LONG.map((name, i) => (
              <option key={i} value={i + 1}>{name.slice(0, 3)}</option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Year</span>
          <Select value={y} onChange={(e) => patch({ start_ym: makeYM(Number(e.target.value), m) })}>
            {years.map((yr) => (
              <option key={yr} value={yr}>{yr}</option>
            ))}
          </Select>
        </label>
      </div>
      <div className="flex pt-1">
        <button onClick={remove} className="ml-auto text-sm font-medium text-bad">Delete</button>
      </div>
    </div>
  );
}

export function EventsSection() {
  const { plan, update } = usePlanScope();
  const [openId, setOpenId] = useState<number | null>(null);
  const [show, setShow] = useState(false);

  const add = () => {
    const ev: PlanEvent = {
      id: nextTempId(),
      name: '',
      total_cost: 0,
      start_ym: addMonths(currentYM(), 1),
      duration_months: 1,
      applies_to: 'all',
    };
    update((d) => ({ ...d, events: [...d.events, ev] }));
    setOpenId(ev.id);
    setShow(true);
  };

  const events = plan.events.filter((e) => e.applies_to === 'all');
  if (events.length === 0 && !show) {
    return (
      <button onClick={add} className="w-full rounded-2xl border border-dashed border-slate-300 bg-white/40 px-4 py-3 text-sm text-slate-400">
        + Add a one-off cost (holiday, car, boiler…)
      </button>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">One-off costs</h2>
        <Button size="sm" onClick={add}>+ Add</Button>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 divide-y divide-slate-100">
        {events.map((e) => (
          <div key={e.id}>
            <button onClick={() => setOpenId(openId === e.id ? null : e.id)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
              <span className="min-w-0 flex-1 truncate text-sm">
                {e.name || <span className="text-slate-400">Untitled</span>}
                <span className="ml-2 text-[10px] text-slate-400">{formatYMShort(e.start_ym)}{e.duration_months > 1 ? ` · ${e.duration_months}mo` : ''}</span>
              </span>
              <span className="text-sm tabular-nums text-slate-700">{gbp(e.total_cost)}</span>
            </button>
            {openId === e.id && <EventEditor ev={e} onClose={() => setOpenId(null)} />}
          </div>
        ))}
      </div>
    </section>
  );
}

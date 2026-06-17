import { useState } from 'react';
import { nextTempId } from '../state/store';
import { usePlanScope } from '../state/scope';
import { addMonths, currentYM, formatYM, makeYM, parseYM, MONTHS_LONG } from '../lib/calendar';
import { gbp, type Target } from '../types';
import type { TargetStatus } from '../types';
import { Button, MoneyInput, Select, TextInput } from './ui';

function TargetEditor({ target, onClose }: { target: Target; onClose: () => void }) {
  const { plan, update } = usePlanScope();
  const savingsLines = plan.bills.filter((b) => b.is_savings);
  const { y, m } = parseYM(target.target_ym || addMonths(currentYM(), 12));
  const patch = (p: Partial<Target>) =>
    update((d) => ({ ...d, targets: d.targets.map((t) => (t.id === target.id ? { ...t, ...p } : t)) }));
  const remove = () => {
    update((d) => ({ ...d, targets: d.targets.filter((t) => t.id !== target.id) }));
    onClose();
  };

  const years = [y, y + 1, y + 2, y + 3, y + 4];

  return (
    <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Name</span>
        <TextInput value={target.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Lake Garda" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Target amount</span>
          <MoneyInput value={target.target_amount} onChange={(n) => patch({ target_amount: n })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">By month</span>
            <Select value={m} onChange={(e) => patch({ target_ym: makeYM(y, Number(e.target.value)) })}>
              {MONTHS_LONG.map((name, i) => (
                <option key={i} value={i + 1}>{name.slice(0, 3)}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Year</span>
            <Select value={y} onChange={(e) => patch({ target_ym: makeYM(Number(e.target.value), m) })}>
              {years.map((yr) => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </Select>
          </label>
        </div>
      </div>
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Fed by (savings line)</span>
        <Select
          value={target.linked_bill_id ?? ''}
          onChange={(e) => patch({ linked_bill_id: e.target.value === '' ? null : Number(e.target.value) })}
        >
          <option value="">— not linked —</option>
          {savingsLines.map((b) => (
            <option key={b.id} value={b.id}>{b.name || 'Untitled savings'}</option>
          ))}
        </Select>
      </label>
      <p className="text-[11px] text-slate-400">
        Link a savings line and its monthly amount fills this goal. Not linked yet? Add a savings outgoing first.
      </p>
      <div className="flex pt-1">
        <button onClick={remove} className="ml-auto text-sm font-medium text-bad">Delete</button>
      </div>
    </div>
  );
}

function StatusLine({ s }: { s: TargetStatus }) {
  const pct = s.target.target_amount > 0 ? Math.min(100, (s.currentBalance / s.target.target_amount) * 100) : 0;
  const onTrack = s.onTrack;

  return (
    <div className="px-4 pb-3">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className={`font-medium ${onTrack ? 'text-good' : 'text-warn'}`}>
          {onTrack
            ? s.projectedHit
              ? `On track — ${formatYM(s.projectedHit)}`
              : 'On track'
            : s.shortfallPerMonth > 0
              ? `Behind — +${gbp(s.shortfallPerMonth)}/mo needed`
              : 'Behind'}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${onTrack ? 'bg-good' : 'bg-warn'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
        <span>{gbp(s.currentBalance)} of {gbp(s.target.target_amount)}</span>
        <span>needs {gbp(s.requiredPerMonth)}/mo · saving {gbp(s.currentContribution)}/mo</span>
      </div>
    </div>
  );
}

export function TargetsSection({ statuses }: { statuses: TargetStatus[] }) {
  const { plan, update } = usePlanScope();
  const [openId, setOpenId] = useState<number | null>(null);

  const add = () => {
    const t: Target = {
      id: nextTempId(),
      name: '',
      target_amount: 0,
      target_ym: addMonths(currentYM(), 12),
      linked_bill_id: plan.bills.find((b) => b.is_savings)?.id ?? null,
    };
    update((d) => ({ ...d, targets: [...d.targets, t] }));
    setOpenId(t.id);
  };

  const byId = new Map(statuses.map((s) => [s.target.id, s]));

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Targets</h2>
        <Button size="sm" onClick={add}>+ Target</Button>
      </div>

      {plan.targets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-4 py-8 text-center text-sm text-slate-400">
          Set a goal — "£4,000 for Lake Garda by Aug 2027" — and watch when you'll hit it.
        </div>
      ) : (
        <div className="space-y-2">
          {plan.targets.map((t) => {
            const s = byId.get(t.id);
            return (
              <div key={t.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                <button onClick={() => setOpenId(openId === t.id ? null : t.id)} className="flex w-full items-center justify-between gap-2 px-4 pt-3 pb-1.5 text-left">
                  <span className="truncate font-semibold">{t.name || <span className="text-slate-400">Untitled goal</span>}</span>
                  <span className="text-sm tabular-nums text-slate-500">{gbp(t.target_amount)}</span>
                </button>
                {s && <StatusLine s={s} />}
                {openId === t.id && <TargetEditor target={t} onClose={() => setOpenId(null)} />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

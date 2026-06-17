import { useState } from 'react';
import { nextTempId } from '../state/store';
import { usePlanScope } from '../state/scope';
import { monthlyNetIncome } from '../engine';
import { FREQUENCIES, gbp, type Frequency, type Income, type PensionType } from '../types';
import { Button, MoneyInput, NumberInput, Select, TextInput, Toggle } from './ui';

function blankIncome(): Income {
  return {
    id: nextTempId(),
    name: '',
    entry_mode: 'net',
    frequency: 'Monthly',
    active: true,
    net_amount: 0,
    gross_annual: null,
    pension_rate: null,
    pension_type: null,
    sacrifice_monthly: null,
    tax_code: null,
  };
}

function IncomeEditor({ income, onClose, onOpenPay }: { income: Income; onClose: () => void; onOpenPay: (id: number) => void }) {
  const { update } = usePlanScope();
  const patch = (p: Partial<Income>) =>
    update((d) => ({ ...d, income: d.income.map((i) => (i.id === income.id ? { ...i, ...p } : i)) }));
  const remove = () => {
    update((d) => ({ ...d, income: d.income.filter((i) => i.id !== income.id) }));
    onClose();
  };

  return (
    <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Name</span>
          <TextInput value={income.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Salary" />
        </label>
        <label className="col-span-2 block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Type</span>
          <Select value={income.entry_mode} onChange={(e) => patch({ entry_mode: e.target.value as 'net' | 'gross' })}>
            <option value="net">Net (take-home)</option>
            <option value="gross">Gross (salary, taxed automatically)</option>
          </Select>
        </label>

        {income.entry_mode === 'net' ? (
          <>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Amount</span>
              <MoneyInput value={income.net_amount} onChange={(n) => patch({ net_amount: n })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Every</span>
              <Select value={income.frequency} onChange={(e) => patch({ frequency: e.target.value as Frequency })}>
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </Select>
            </label>
          </>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Gross / year</span>
              <MoneyInput value={income.gross_annual} onChange={(n) => patch({ gross_annual: n })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Pension</span>
              <NumberInput value={income.pension_rate} onChange={(n) => patch({ pension_rate: n })} suffix="%" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Pension type</span>
              <Select value={income.pension_type ?? 'relief_at_source'} onChange={(e) => patch({ pension_type: e.target.value as PensionType })}>
                <option value="salary_sacrifice">Salary sacrifice</option>
                <option value="net_pay">Net pay</option>
                <option value="relief_at_source">Relief at source</option>
              </Select>
            </label>
            <label className="col-span-2 block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Salary sacrifice £/mo (EV, cycle, extra pension…)</span>
              <MoneyInput value={income.sacrifice_monthly} onChange={(n) => patch({ sacrifice_monthly: n })} />
            </label>
            <label className="col-span-2 block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Tax code (optional)</span>
              <TextInput
                value={income.tax_code ?? ''}
                onChange={(e) => patch({ tax_code: e.target.value.trim() === '' ? null : e.target.value.toUpperCase() })}
                placeholder="1257L"
              />
            </label>
            <p className="col-span-2 text-[11px] text-slate-400">
              Salary-sacrifice items come off before tax &amp; NI. Set the pension type to “Salary sacrifice” if your pension is sacrificed too.
            </p>
            <button onClick={() => onOpenPay(income.id)} className="col-span-2 text-left text-sm font-medium text-accent">
              Open full pay breakdown →
            </button>
          </>
        )}
      </div>
      <div className="flex items-center gap-5 pt-1">
        <Toggle checked={income.active} onChange={(b) => patch({ active: b })} label="Active" />
        <button onClick={remove} className="ml-auto text-sm font-medium text-bad">Delete</button>
      </div>
    </div>
  );
}

export function IncomeSection({ onOpenPay }: { onOpenPay: (id: number) => void }) {
  const { plan, taxConfig, update } = usePlanScope();
  const [openId, setOpenId] = useState<number | null>(null);

  const add = () => {
    const i = blankIncome();
    update((d) => ({ ...d, income: [...d.income, i] }));
    setOpenId(i.id);
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Income</h2>
        <Button size="sm" onClick={add}>+ Income</Button>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        {plan.income.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-400">Add your take-home pay or salary.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {plan.income.map((i) => (
              <div key={i.id}>
                <button onClick={() => setOpenId(openId === i.id ? null : i.id)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {i.name || <span className="text-slate-400">Untitled</span>}
                    {i.entry_mode === 'gross' && <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-accent">gross</span>}
                    {!i.active && <span className="ml-2 text-[10px] text-slate-400">off</span>}
                  </span>
                  <span className="text-sm font-medium tabular-nums text-slate-700">{gbp(monthlyNetIncome(i, taxConfig))}<span className="text-xs font-normal text-slate-400">/mo</span></span>
                </button>
                {openId === i.id && <IncomeEditor income={i} onClose={() => setOpenId(null)} onOpenPay={onOpenPay} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

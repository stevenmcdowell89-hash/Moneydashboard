import { useMemo } from 'react';
import { useStore, nextTempId } from '../state/store';
import { netBonus, netFromGross } from '../engine';
import { addMonths, currentYM, formatYMShort, makeYM, parseYM, MONTHS_LONG } from '../lib/calendar';
import { gbp, gbp2, type IncomeOneoff, type PayBreakdown, type PensionType } from '../types';
import { Button, Modal, MoneyInput, NumberInput, Select, TextInput } from './ui';

function Row({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'good' | 'muted' }) {
  const c = tone === 'bad' ? 'text-bad' : tone === 'good' ? 'text-good' : tone === 'muted' ? 'text-slate-400' : 'text-ink';
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium tabular-nums ${c}`}>{value}</span>
    </div>
  );
}

function Breakdown({ b }: { b: PayBreakdown }) {
  return (
    <div className="mt-2 divide-y divide-slate-100">
      <Row label="Gross / year" value={gbp(b.grossAnnual)} />
      <Row label="Pension / sacrifice" value={`− ${gbp(b.pensionAnnual)}`} tone="muted" />
      <Row label="Personal allowance" value={gbp(b.personalAllowance)} />
      <Row label="Taxable" value={gbp(b.taxableIncome)} />
      <Row label="Income tax" value={`− ${gbp(b.incomeTax)}`} tone="bad" />
      <Row label="Employee NI" value={`− ${gbp(b.nationalInsurance)}`} tone="bad" />
      {b.reliefAtSourceTopUp > 0 && <Row label="Tax relief to pot" value={`+ ${gbp(b.reliefAtSourceTopUp)}`} tone="good" />}
      <Row label="Net / year" value={gbp(b.netAnnual)} tone="good" />
    </div>
  );
}

export function PayBreakdownModal({ incomeId, onClose }: { incomeId: number; onClose: () => void }) {
  const { plan, taxConfig, update } = useStore();
  const income = plan.income.find((i) => i.id === incomeId);
  const lbl = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400';

  const breakdown = useMemo(() => {
    if (!income || !taxConfig) return null;
    return netFromGross(
      income.gross_annual ?? 0,
      income.pension_rate ?? 0,
      income.pension_type ?? 'relief_at_source',
      income.sacrifice_monthly ?? 0,
      taxConfig,
      income.tax_code,
    );
  }, [income, taxConfig]);

  if (!income) return null;
  const patch = (p: Partial<typeof income>) =>
    update((d) => ({ ...d, income: d.income.map((i) => (i.id === income.id ? { ...i, ...p } : i)) }));

  const addBonus = () =>
    update((d) => ({
      ...d,
      income_oneoff: [
        ...d.income_oneoff,
        { id: nextTempId(), name: 'Bonus', gross_amount: 0, month_ym: addMonths(currentYM(), 1), pension_sacrifice_pct: 0 },
      ],
    }));
  const patchBonus = (id: number, p: Partial<IncomeOneoff>) =>
    update((d) => ({ ...d, income_oneoff: d.income_oneoff.map((b) => (b.id === id ? { ...b, ...p } : b)) }));
  const removeBonus = (id: number) =>
    update((d) => ({ ...d, income_oneoff: d.income_oneoff.filter((b) => b.id !== id) }));

  return (
    <Modal open onClose={onClose} title={`Pay — ${income.name || 'income'}`}>
      {!taxConfig ? (
        <p className="text-sm text-slate-500">Set a tax year in Settings to estimate take-home.</p>
      ) : (
        <div className="space-y-3">
          {breakdown && (
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Net monthly</p>
              <p className="text-3xl font-bold tabular-nums text-good">{gbp2(breakdown.netMonthly)}</p>
              <Breakdown b={breakdown} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className={lbl}>Gross / year</span><MoneyInput value={income.gross_annual} onChange={(n) => patch({ gross_annual: n })} /></label>
            <label className="block"><span className={lbl}>Pension</span><NumberInput value={income.pension_rate} onChange={(n) => patch({ pension_rate: n })} suffix="%" /></label>
            <label className="block">
              <span className={lbl}>Pension type</span>
              <Select value={income.pension_type ?? 'relief_at_source'} onChange={(e) => patch({ pension_type: e.target.value as PensionType })}>
                <option value="salary_sacrifice">Salary sacrifice</option>
                <option value="net_pay">Net pay</option>
                <option value="relief_at_source">Relief at source</option>
              </Select>
            </label>
            <label className="block"><span className={lbl}>Sacrifice £/mo</span><MoneyInput value={income.sacrifice_monthly} onChange={(n) => patch({ sacrifice_monthly: n })} /></label>
            <label className="col-span-2 block"><span className={lbl}>Tax code</span><TextInput value={income.tax_code ?? ''} onChange={(e) => patch({ tax_code: e.target.value.trim() === '' ? null : e.target.value.toUpperCase() })} placeholder="1257L" /></label>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className={lbl}>Bonuses</span>
              <button onClick={addBonus} className="text-sm font-medium text-accent">+ Add</button>
            </div>
            {plan.income_oneoff.map((b) => {
              const { y, m } = parseYM(b.month_ym || currentYM());
              const net = netBonus(b, plan.income, taxConfig);
              return (
                <div key={b.id} className="mb-2 rounded-xl bg-slate-50 p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <TextInput value={b.name} onChange={(e) => patchBonus(b.id, { name: e.target.value })} placeholder="Bonus" />
                    <MoneyInput value={b.gross_amount} onChange={(n) => patchBonus(b.id, { gross_amount: n })} />
                    <Select value={m} onChange={(e) => patchBonus(b.id, { month_ym: makeYM(y, Number(e.target.value)) })}>
                      {MONTHS_LONG.map((name, i) => (<option key={i} value={i + 1}>{name.slice(0, 3)}</option>))}
                    </Select>
                    <Select value={y} onChange={(e) => patchBonus(b.id, { month_ym: makeYM(Number(e.target.value), m) })}>
                      {[y, y + 1, y + 2].map((yr) => (<option key={yr} value={yr}>{yr}</option>))}
                    </Select>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Net {formatYMShort(b.month_ym)}: <b className="text-good">{gbp(net)}</b></span>
                    <button onClick={() => removeBonus(b.id)} className="font-medium text-bad">Remove</button>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-400">Estimate, not exact PAYE (which is cumulative across the year).</p>
          <Button className="w-full" onClick={onClose}>Done</Button>
        </div>
      )}
    </Modal>
  );
}

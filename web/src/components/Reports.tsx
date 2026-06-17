import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useStore } from '../state/store';
import { monthlyBillAmount, totalMonthlyIncome } from '../engine';
import { gbp } from '../types';

const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#475569'];

export function Reports() {
  const { plan, taxConfig } = useStore();

  const { income, spend, saved, byCategory } = useMemo(() => {
    const income = totalMonthlyIncome(plan.income, taxConfig);
    let spend = 0;
    let saved = 0;
    const cats = new Map<string, number>();
    for (const b of plan.bills) {
      if (!b.active) continue;
      const amt = monthlyBillAmount(b);
      if (b.is_savings) saved += amt;
      else spend += amt;
      const key = (b.category && b.category.trim()) || 'Other';
      cats.set(key, (cats.get(key) ?? 0) + amt);
    }
    const byCategory = [...cats.entries()].sort((a, b) => b[1] - a[1]);
    return { income, spend, saved, byCategory };
  }, [plan, taxConfig]);

  const leftover = Math.max(0, income - spend - saved);
  const split = [
    { name: 'Spend', value: Math.round(spend), color: '#dc2626' },
    { name: 'Savings', value: Math.round(saved), color: '#16a34a' },
    { name: 'Left', value: Math.round(leftover), color: '#2563eb' },
  ].filter((d) => d.value > 0);

  const maxCat = byCategory.reduce((m, [, v]) => Math.max(m, v), 0) || 1;

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-1 text-sm font-semibold text-slate-600">Where your income goes (per month)</h3>
        <div className="flex items-center gap-3">
          <div className="h-32 w-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={split} dataKey="value" nameKey="name" innerRadius={32} outerRadius={56} paddingAngle={2}>
                  {split.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => gbp(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Income</span><span className="font-semibold tabular-nums">{gbp(income)}</span></div>
            <div className="flex justify-between"><span className="text-bad">Spend</span><span className="tabular-nums">{gbp(spend)}</span></div>
            <div className="flex justify-between"><span className="text-good">Savings</span><span className="tabular-nums">{gbp(saved)}</span></div>
            <div className="flex justify-between border-t border-slate-100 pt-1"><span className="text-accent">Left over</span><span className="font-semibold tabular-nums">{gbp(income - spend - saved)}</span></div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-600">Outgoings by category (per month)</h3>
        {byCategory.length === 0 ? (
          <p className="text-sm text-slate-400">No outgoings yet.</p>
        ) : (
          <div className="space-y-2">
            {byCategory.map(([name, val], i) => (
              <div key={name}>
                <div className="mb-0.5 flex justify-between text-xs">
                  <span className="text-slate-600">{name}</span>
                  <span className="tabular-nums text-slate-500">{gbp(val)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${(val / maxCat) * 100}%`, background: PALETTE[i % PALETTE.length] }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

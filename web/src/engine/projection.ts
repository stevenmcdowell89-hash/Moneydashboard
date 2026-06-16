import type { ProjectionPoint, ProjectionResult, ResolvedPlan, TargetProjection, TaxConfig } from '../types';
import { normalizeFrequency } from './frequency';
import { netBonus, totalMonthlyIncome } from './income';

/** Monthly cost an event contributes when active (spread evenly over its duration). */
const eventMonthly = (totalCost: number, duration: number) => (duration > 0 ? totalCost / duration : totalCost);

/**
 * Project cash and per-target savings month-by-month over the horizon.
 *
 *   netFlow(m) = income(+bonus) - bills - events(m) - sum(contributions)
 *   cash(m)    = (m==1 ? opening_cash : cash(m-1)) + netFlow(m)
 *   target.balance(m) = prev*(1 + annual_rate/12) + monthly_contribution
 *   savingsTotal(m)   = sum of target balances at month m
 */
export function project(plan: ResolvedPlan, horizon: number, taxConfig: TaxConfig | null): ProjectionResult {
  const H = Math.max(1, Math.floor(horizon));
  const monthlyIncome = totalMonthlyIncome(plan.income, taxConfig);
  const monthlyBills = plan.bills.reduce(
    (s, b) => s + (b.active ? normalizeFrequency(b.amount, b.frequency) : 0),
    0,
  );
  const monthlyContrib = plan.savings_targets.reduce((s, t) => s + (t.monthly_contribution || 0), 0);

  // Pre-compute net bonus by month.
  const bonusByMonth = new Map<number, number>();
  for (const o of plan.income_oneoff) {
    if (o.month >= 1 && o.month <= H) {
      bonusByMonth.set(o.month, (bonusByMonth.get(o.month) ?? 0) + netBonus(o, plan.income, taxConfig));
    }
  }

  // Running target balances.
  const balances = plan.savings_targets.map((t) => t.balance || 0);
  const targetSeries: number[][] = plan.savings_targets.map(() => []);

  const points: ProjectionPoint[] = [];
  let cash = plan.opening_cash;

  for (let m = 1; m <= H; m++) {
    const events = plan.events.reduce((s, e) => {
      const end = e.start_month + e.duration_months - 1;
      return m >= e.start_month && m <= end ? s + eventMonthly(e.total_cost, e.duration_months) : s;
    }, 0);

    const bonus = bonusByMonth.get(m) ?? 0;
    const income = monthlyIncome + bonus;
    const netFlow = income - monthlyBills - events - monthlyContrib;
    cash = (m === 1 ? plan.opening_cash : cash) + netFlow;

    // Compound each target then add its contribution.
    let savingsTotal = 0;
    for (let t = 0; t < balances.length; t++) {
      const tgt = plan.savings_targets[t];
      balances[t] = balances[t] * (1 + (tgt.annual_rate || 0) / 100 / 12) + (tgt.monthly_contribution || 0);
      targetSeries[t].push(balances[t]);
      savingsTotal += balances[t];
    }

    points.push({
      month: m,
      income,
      bills: monthlyBills,
      events,
      contributions: monthlyContrib,
      netFlow,
      cash,
      savingsTotal,
    });
  }

  const targets: TargetProjection[] = plan.savings_targets.map((t, i) => ({
    targetId: t.id,
    name: t.name,
    balances: targetSeries[i],
    endBalance: targetSeries[i][targetSeries[i].length - 1] ?? t.balance,
  }));

  let lowest = { month: 1, value: points[0]?.cash ?? plan.opening_cash };
  for (const p of points) if (p.cash < lowest.value) lowest = { month: p.month, value: p.cash };

  return { points, targets, lowestCash: lowest, horizon: H };
}

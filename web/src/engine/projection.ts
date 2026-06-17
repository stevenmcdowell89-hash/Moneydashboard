import type { Bill, ProjectionPoint, ProjectionResult, ResolvedPlan, TaxConfig } from '../types';
import { normalizeFrequency } from './frequency';
import { netBonus, totalMonthlyIncome } from './income';
import { offsetToYM, ymToOffset } from '../lib/calendar';

/** Monthly amount a bill contributes when active, else 0. */
const monthlyAmount = (b: Bill): number => (b.active ? normalizeFrequency(b.amount, b.frequency) : 0);

/** Monthly cost an event contributes when active (spread evenly over its duration). */
const eventMonthly = (totalCost: number, duration: number) => (duration > 0 ? totalCost / duration : totalCost);

/**
 * Project cash and savings-line balances month-by-month over the horizon.
 *
 *   spend(m)   = sum monthlyAmount of active, non-savings bills
 *   saved(m)   = sum monthlyAmount of active savings-line bills
 *   events(m)  = sum of event costs active in month m (spread over duration)
 *   income(m)  = monthly net income + any net bonus landing this month
 *   netFlow(m) = income - spend - saved - events
 *   cash(m)    = (m==1 ? opening_cash : cash(m-1)) + netFlow
 *   savings line balance(m) = prev*(1 + (rate_override ?? savingsRate)/100/12) + monthlyAmount
 *   savingsTotal(m)         = sum of savings-line balances at month m
 */
export function project(plan: ResolvedPlan, horizon: number, taxConfig: TaxConfig | null): ProjectionResult {
  const H = Math.max(1, Math.floor(horizon));
  const nowYM = plan.nowYM;
  const monthlyIncome = totalMonthlyIncome(plan.income, taxConfig);

  // Partition bills.
  const spendBills = plan.bills.filter((b) => b.active && !b.is_savings);
  const savingsBills = plan.bills.filter((b) => b.active && b.is_savings);

  // Per-line monthly rate: a savings line's own rate_override (%) when set,
  // otherwise the global savingsRate.
  const savingsRates = savingsBills.map((b) => (b.rate_override ?? plan.savingsRate) / 100 / 12);

  const spend = spendBills.reduce((s, b) => s + monthlyAmount(b), 0);
  const saved = savingsBills.reduce((s, b) => s + monthlyAmount(b), 0);

  // Pre-compute net bonus by offset.
  const bonusByOffset = new Map<number, number>();
  for (const o of plan.income_oneoff) {
    const off = ymToOffset(o.month_ym, nowYM);
    if (off >= 1 && off <= H) {
      bonusByOffset.set(off, (bonusByOffset.get(off) ?? 0) + netBonus(o, plan.income, taxConfig));
    }
  }

  // Running savings-line balances.
  const balances = savingsBills.map((b) => b.balance || 0);

  const points: ProjectionPoint[] = [];
  let cash = plan.opening_cash;

  for (let offset = 1; offset <= H; offset++) {
    const ym = offsetToYM(offset, nowYM);

    const events = plan.events.reduce((s, e) => {
      const start = ymToOffset(e.start_ym, nowYM);
      const end = start + e.duration_months - 1;
      return offset >= start && offset <= end ? s + eventMonthly(e.total_cost, e.duration_months) : s;
    }, 0);

    const bonus = bonusByOffset.get(offset) ?? 0;
    const income = monthlyIncome + bonus;
    const netFlow = income - spend - saved - events;
    cash = (offset === 1 ? plan.opening_cash : cash) + netFlow;

    // Advance each savings-line balance one month, then sum.
    let savingsTotal = 0;
    for (let i = 0; i < balances.length; i++) {
      balances[i] = balances[i] * (1 + savingsRates[i]) + monthlyAmount(savingsBills[i]);
      savingsTotal += balances[i];
    }

    points.push({ offset, ym, income, spend, saved, events, netFlow, cash, savingsTotal });
  }

  let lowest = { offset: 1, ym: points[0]?.ym ?? offsetToYM(1, nowYM), value: points[0]?.cash ?? plan.opening_cash };
  for (const p of points) if (p.cash < lowest.value) lowest = { offset: p.offset, ym: p.ym, value: p.cash };

  return { points, lowestCash: lowest, horizon: H, nowYM };
}

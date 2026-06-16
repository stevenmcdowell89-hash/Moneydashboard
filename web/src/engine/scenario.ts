import type { Bill, Income, PlanState, ResolvedPlan, ScenarioOverride } from '../types';
import { currentYM } from '../lib/calendar';

// Build a lookup of overrides for a scenario, keyed by `${item_type}:${item_id}`.
function overrideMap(overrides: ScenarioOverride[], scenarioId: number): Map<string, number | null> {
  const m = new Map<string, number | null>();
  for (const o of overrides) {
    if (o.scenario_id === scenarioId) m.set(`${o.item_type}:${o.item_id}`, o.override_amount);
  }
  return m;
}

// Apply an income override: a present non-null override becomes a fixed Monthly
// NET amount (0 = cancelled). null/absent leaves the line unchanged.
function applyIncome(income: Income, ov: number | null | undefined): Income {
  if (ov === undefined || ov === null) return income;
  return { ...income, entry_mode: 'net', frequency: 'Monthly', net_amount: ov, active: ov !== 0 };
}

// Apply a bill override (savings lines are bills too): a present non-null
// override becomes a fixed Monthly amount (0 = cancelled). null/absent unchanged.
function applyBill(bill: Bill, ov: number | null | undefined): Bill {
  if (ov === undefined || ov === null) return bill;
  return { ...bill, frequency: 'Monthly', amount: ov, active: ov !== 0 };
}

/**
 * Produce the effective plan after applying a scenario's overrides + anchor it
 * to a projection "now".
 *  - override present (non-null) replaces the line's monthly value (0 = cancelled).
 *  - override absent / null leaves the base line unchanged.
 *  - savings lines ARE bills, so item_type 'bill' covers them; legacy item_type
 *    values are ignored (no income/bill line matches them).
 *  - events filtered to those that apply to this scenario (`all` or this id).
 * Passing scenarioId === null yields the base plan untouched.
 */
export function resolveScenario(
  plan: PlanState,
  scenarioId: number | null,
  nowYM: string = currentYM(),
): ResolvedPlan {
  const sid = scenarioId ?? null;
  const ov = sid === null ? new Map<string, number | null>() : overrideMap(plan.scenario_overrides, sid);

  const income = plan.income.map((i) => applyIncome(i, ov.get(`income:${i.id}`)));
  const bills = plan.bills.map((b) => applyBill(b, ov.get(`bill:${b.id}`)));

  const events = plan.events.filter((e) => e.applies_to === 'all' || (sid !== null && e.applies_to === String(sid)));

  return {
    income,
    income_oneoff: plan.income_oneoff,
    bills,
    events,
    opening_cash: plan.settings.opening_cash,
    savingsRate: plan.settings.default_savings_rate,
    nowYM,
    scenarioId: sid,
  };
}

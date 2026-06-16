import type { Bill, Income, PlanState, ResolvedPlan, SavingsTarget, ScenarioOverride } from '../types';

// Build a lookup of overrides for a scenario, keyed by `${item_type}:${item_id}`.
function overrideMap(overrides: ScenarioOverride[], scenarioId: number): Map<string, number | null> {
  const m = new Map<string, number | null>();
  for (const o of overrides) {
    if (o.scenario_id === scenarioId) m.set(`${o.item_type}:${o.item_id}`, o.override_amount);
  }
  return m;
}

// Apply an income override: a present override becomes a fixed Monthly NET amount.
function applyIncome(income: Income, ov: number | null | undefined): Income {
  if (ov === undefined) return income;
  if (ov === null) return income; // explicit "unchanged"
  return { ...income, entry_mode: 'net', frequency: 'Monthly', net_amount: ov, active: ov !== 0 };
}

function applyBill(bill: Bill, ov: number | null | undefined): Bill {
  if (ov === undefined || ov === null) return bill;
  return { ...bill, frequency: 'Monthly', amount: ov, active: ov !== 0 };
}

function applySavings(t: SavingsTarget, ov: number | null | undefined): SavingsTarget {
  if (ov === undefined || ov === null) return t;
  return { ...t, monthly_contribution: ov };
}

/**
 * Produce the effective plan after applying a scenario's overrides.
 * - override present (non-null) replaces the line's monthly value (0 = cancelled).
 * - override absent / null leaves the base line unchanged.
 * - events filtered to those that apply to this scenario (`all` or this id).
 * Passing scenarioId === null yields the base plan untouched.
 */
export function resolveScenario(plan: PlanState, scenarioId: number | null): ResolvedPlan {
  const sid = scenarioId ?? null;
  const ov = sid === null ? new Map<string, number | null>() : overrideMap(plan.scenario_overrides, sid);

  const income = plan.income.map((i) => applyIncome(i, ov.get(`income:${i.id}`)));
  const bills = plan.bills.map((b) => applyBill(b, ov.get(`bill:${b.id}`)));
  const savings_targets = plan.savings_targets.map((t) => applySavings(t, ov.get(`savings:${t.id}`)));

  const events = plan.events.filter((e) => e.applies_to === 'all' || (sid !== null && e.applies_to === String(sid)));

  return {
    income,
    income_oneoff: plan.income_oneoff,
    bills,
    savings_targets,
    events,
    opening_cash: plan.settings.opening_cash,
    scenarioId: sid,
  };
}

import { useMemo } from 'react';
import { project, resolveScenario, monthlyNetIncome, normalizeFrequency } from '../engine';
import { useStore } from '../state/store';
import type { ProjectionResult } from '../types';

/** Base (or scenario) projection derived from the live plan. */
export function useProjection(horizon: number, scenarioId: number | null = null): ProjectionResult {
  const { plan, taxConfig } = useStore();
  return useMemo(() => {
    const resolved = resolveScenario(plan, scenarioId);
    return project(resolved, horizon, taxConfig);
  }, [plan, taxConfig, horizon, scenarioId]);
}

/** Headline monthly figures for "This Month". */
export function useThisMonth() {
  const { plan, taxConfig } = useStore();
  return useMemo(() => {
    const income = plan.income.reduce((s, i) => s + monthlyNetIncome(i, taxConfig), 0);
    const bills = plan.bills.reduce((s, b) => s + (b.active ? normalizeFrequency(b.amount, b.frequency) : 0), 0);
    const contributions = plan.savings_targets.reduce((s, t) => s + (t.monthly_contribution || 0), 0);
    const events = plan.events
      .filter((e) => e.applies_to === 'all' && e.start_month <= 1 && e.start_month + e.duration_months - 1 >= 1)
      .reduce((s, e) => s + (e.duration_months > 0 ? e.total_cost / e.duration_months : e.total_cost), 0);
    const freeCash = income - bills - events; // before savings
    const safeToSpend = freeCash - contributions; // after savings set-aside
    const currentCash = plan.settings.opening_cash;
    return { income, bills, contributions, events, freeCash, safeToSpend, currentCash };
  }, [plan, taxConfig]);
}

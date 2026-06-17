import type { PlanState, ResolvedPlan } from '../types';
import { currentYM } from '../lib/calendar';

/**
 * Produce the effective plan for projection from a plan-like slice and anchor it
 * to a projection "now".
 *
 * Scenarios are full independent copies of the editable plan (no more overrides),
 * so this is a straight mapping: a scenario passes its own copy of settings /
 * income / bills / events, the base plan passes its own. All events are kept —
 * each plan carries the events that belong to it.
 */
export function resolveScenario(
  plan: Pick<PlanState, 'settings' | 'income' | 'income_oneoff' | 'bills' | 'events'>,
  nowYM: string = currentYM(),
): ResolvedPlan {
  return {
    income: plan.income,
    income_oneoff: plan.income_oneoff,
    bills: plan.bills,
    events: plan.events,
    opening_cash: plan.settings.opening_cash,
    savingsRate: plan.settings.default_savings_rate,
    nowYM,
    scenarioId: null,
  };
}

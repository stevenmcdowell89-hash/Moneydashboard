import { emptyPlan, type PlanState, type ScenarioPlan } from '../types';

/** The editable slice a scenario clones from the live plan (deep copy). */
export function scenarioPlanFrom(plan: PlanState): ScenarioPlan {
  return JSON.parse(
    JSON.stringify({
      settings: plan.settings,
      income: plan.income,
      income_oneoff: plan.income_oneoff,
      bills: plan.bills,
      targets: plan.targets,
      events: plan.events,
    }),
  ) as ScenarioPlan;
}

/** Parse a scenario payload into a ScenarioPlan, tolerating missing fields. */
export function parsePayload(payload: string): ScenarioPlan {
  const base = emptyPlan();
  try {
    const p = JSON.parse(payload || '{}') as Partial<ScenarioPlan>;
    return {
      settings: { ...base.settings, ...(p.settings ?? {}) },
      income: p.income ?? [],
      income_oneoff: p.income_oneoff ?? [],
      bills: p.bills ?? [],
      targets: p.targets ?? [],
      events: p.events ?? [],
    };
  } catch {
    return {
      settings: base.settings,
      income: [],
      income_oneoff: [],
      bills: [],
      targets: [],
      events: [],
    };
  }
}

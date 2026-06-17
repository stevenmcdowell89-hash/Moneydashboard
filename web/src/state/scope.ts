import { createContext, useContext } from 'react';
import { useStore } from './store';
import type { ScenarioPlan, TaxConfig } from '../types';

// A PlanScope lets the editor sections (Income / Outgoings / Targets / Events /
// pay breakdown) operate on EITHER the live plan or a scenario's own copy, by
// reading/writing the same `{ settings, income, income_oneoff, bills, targets,
// events }` slice. Home uses the default (the live store); the scenarios
// workspace wraps its editor in a PlanScopeProvider bound to the scenario.

export interface PlanScope {
  plan: ScenarioPlan;
  update: (fn: (p: ScenarioPlan) => ScenarioPlan) => void;
  taxConfig: TaxConfig | null;
}

const Ctx = createContext<PlanScope | null>(null);
export const PlanScopeProvider = Ctx.Provider;

export function usePlanScope(): PlanScope {
  const store = useStore();
  const scope = useContext(Ctx);
  if (scope) return scope;
  // Default: the live plan. fn returns the edited slice; spreading over the full
  // PlanState preserves `scenarios`.
  return {
    plan: store.plan,
    update: (fn) => store.update((d) => ({ ...d, ...fn(d) })),
    taxConfig: store.taxConfig,
  };
}

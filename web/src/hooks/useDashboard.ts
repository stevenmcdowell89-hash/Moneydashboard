import { useMemo } from 'react';
import { project, resolveScenario, targetStatus } from '../engine';
import { useStore } from '../state/store';
import { todayYM, type ProjectionResult, type ScenarioPlan, type TargetStatus, type TaxConfig } from '../types';

export interface PlanEvaluation {
  result: ProjectionResult;
  targets: TargetStatus[];
  monthOne: { income: number; spend: number; saved: number; events: number; leftToSpend: number };
}

/** Pure: project a plan (base or scenario) and evaluate its targets. */
export function evaluatePlan(
  plan: ScenarioPlan,
  taxConfig: TaxConfig | null,
  horizon: number,
  nowYM: string = todayYM(),
): PlanEvaluation {
  const resolved = resolveScenario(plan, nowYM);
  const result = project(resolved, horizon, taxConfig);
  const targets = plan.targets.map((t) => targetStatus(t, resolved));
  const p0 = result.points[0];
  return {
    result,
    targets,
    monthOne: {
      income: p0?.income ?? 0,
      spend: p0?.spend ?? 0,
      saved: p0?.saved ?? 0,
      events: p0?.events ?? 0,
      leftToSpend: p0?.netFlow ?? 0,
    },
  };
}

/** The live base plan, evaluated for the home dashboard. */
export function useDashboard(horizon: number): PlanEvaluation {
  const { plan, taxConfig } = useStore();
  return useMemo(() => evaluatePlan(plan, taxConfig, horizon), [plan, taxConfig, horizon]);
}

import { useMemo } from 'react';
import { project, resolveScenario, targetStatus } from '../engine';
import { useStore } from '../state/store';
import { todayYM, type Bill, type Income, type PlanState, type ProjectionResult, type TargetStatus } from '../types';

/** A what-if draft: a map of `income:ID` / `bill:ID` -> overridden monthly amount. */
export type Draft = Map<string, number>;

export const draftKey = (type: 'income' | 'bill', id: number) => `${type}:${id}`;

/** Apply draft overrides to a plan (in memory, not persisted). */
export function applyDraft(plan: PlanState, draft: Draft): PlanState {
  if (draft.size === 0) return plan;
  const income = plan.income.map((i): Income => {
    const v = draft.get(draftKey('income', i.id));
    return v === undefined ? i : { ...i, entry_mode: 'net', frequency: 'Monthly', net_amount: v, active: v !== 0 };
  });
  const bills = plan.bills.map((b): Bill => {
    const v = draft.get(draftKey('bill', b.id));
    return v === undefined ? b : { ...b, frequency: 'Monthly', amount: v, active: v !== 0 };
  });
  return { ...plan, income, bills };
}

export interface DashboardModel {
  nowYM: string;
  horizon: number;
  base: ProjectionResult;          // live plan
  current: ProjectionResult;       // with the what-if draft applied
  hasDraft: boolean;
  /** Per-target status under base & current, plus deltas. */
  targets: {
    base: TargetStatus;
    current: TargetStatus;
    monthsDelta: number | null;    // current.projectedHit vs base.projectedHit (− = sooner)
  }[];
  monthOne: { income: number; spend: number; saved: number; events: number; leftToSpend: number };
  endCashDelta: number;            // current end cash − base end cash
  inRed: boolean;                  // current ever goes negative
  wasRed: boolean;                 // base ever goes negative
}

function monthsBetweenYM(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by * 12 + bm) - (ay * 12 + am);
}

export function useDashboard(horizon: number, draft: Draft): DashboardModel {
  const { plan, taxConfig } = useStore();
  return useMemo(() => {
    const nowYM = todayYM();
    const baseResolved = resolveScenario(plan, null, nowYM);
    const base = project(baseResolved, horizon, taxConfig);

    const draftedPlan = applyDraft(plan, draft);
    const currentResolved = resolveScenario(draftedPlan, null, nowYM);
    const current = project(currentResolved, horizon, taxConfig);

    const targets = plan.targets.map((t) => {
      const b = targetStatus(t, baseResolved);
      const c = targetStatus(t, currentResolved);
      return { base: b, current: c, monthsDelta: monthsBetweenYM(b.projectedHit, c.projectedHit) };
    });

    const p0 = current.points[0];
    const monthOne = {
      income: p0?.income ?? 0,
      spend: p0?.spend ?? 0,
      saved: p0?.saved ?? 0,
      events: p0?.events ?? 0,
      leftToSpend: p0?.netFlow ?? 0,
    };

    const endCashDelta =
      (current.points[current.points.length - 1]?.cash ?? 0) - (base.points[base.points.length - 1]?.cash ?? 0);

    return {
      nowYM,
      horizon,
      base,
      current,
      hasDraft: draft.size > 0,
      targets,
      monthOne,
      endCashDelta,
      inRed: current.lowestCash.value < 0,
      wasRed: base.lowestCash.value < 0,
    };
  }, [plan, taxConfig, horizon, draft]);
}

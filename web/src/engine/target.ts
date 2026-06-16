import type { SavingsTarget } from '../types';

/**
 * Monthly contribution required to hit a savings goal, accounting for compound
 * interest at the target's annual rate.
 *
 *   r = annual_rate/12 ; n = monthsRemaining
 *   r == 0 -> (target - balance) / n
 *   else   -> (target - balance*(1+r)^n) * r / ((1+r)^n - 1)
 */
export function requiredContribution(target: SavingsTarget, monthsRemaining: number): number {
  const goal = target.target_amount ?? 0;
  const n = Math.max(0, Math.floor(monthsRemaining));
  if (n <= 0) return Math.max(0, goal - target.balance);

  const r = (target.annual_rate || 0) / 100 / 12;
  if (r === 0) return Math.max(0, (goal - target.balance) / n);

  const growth = Math.pow(1 + r, n);
  const needed = ((goal - target.balance * growth) * r) / (growth - 1);
  return Math.max(0, needed);
}

/** Will this target hit its goal given current contributions? Returns the month it lands (1..n) or null. */
export function monthGoalHit(target: SavingsTarget, horizon: number): number | null {
  const goal = target.target_amount;
  if (goal == null) return null;
  const r = (target.annual_rate || 0) / 100 / 12;
  let bal = target.balance;
  for (let m = 1; m <= horizon; m++) {
    bal = bal * (1 + r) + target.monthly_contribution;
    if (bal >= goal) return m;
  }
  return null;
}

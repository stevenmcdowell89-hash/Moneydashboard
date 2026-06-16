import type { Bill, ResolvedPlan, Target, TargetStatus } from '../types';
import { normalizeFrequency } from './frequency';
import { offsetToYM, ymToOffset } from '../lib/calendar';

/** Monthly amount a bill (savings line) contributes when active, else 0. */
export function monthlyBillAmount(bill: Bill): number {
  return bill.active ? normalizeFrequency(bill.amount, bill.frequency) : 0;
}

/**
 * Monthly contribution required to reach `targetAmount` from `currentBalance`
 * over `monthsRemaining` months, compounding monthly at `annualRatePct`.
 *
 *   r = annualRatePct/100/12 ; n = monthsRemaining
 *   n <= 0 -> max(0, target - balance)
 *   r == 0 -> max(0, (target - balance) / n)
 *   else   -> max(0, (target - balance*(1+r)^n) * r / ((1+r)^n - 1))
 */
export function requiredContribution(
  targetAmount: number,
  currentBalance: number,
  monthsRemaining: number,
  annualRatePct: number,
): number {
  const n = Math.floor(monthsRemaining);
  if (n <= 0) return Math.max(0, targetAmount - currentBalance);

  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.max(0, (targetAmount - currentBalance) / n);

  const growth = Math.pow(1 + r, n);
  return Math.max(0, ((targetAmount - currentBalance * growth) * r) / (growth - 1));
}

/**
 * Simulate a balance growing at `annualRatePct` (monthly compounding) with a
 * fixed `monthlyContribution`. Returns the first offset (1..maxOffset) at which
 * the balance reaches `targetAmount`, or null if it never does within maxOffset.
 */
export function monthGoalHitOffset(
  currentBalance: number,
  monthlyContribution: number,
  annualRatePct: number,
  targetAmount: number,
  maxOffset: number,
): number | null {
  const r = annualRatePct / 100 / 12;
  let bal = currentBalance;
  for (let offset = 1; offset <= maxOffset; offset++) {
    bal = bal * (1 + r) + monthlyContribution;
    if (bal >= targetAmount) return offset;
  }
  return null;
}

/**
 * Status of a savings goal against the resolved plan. Reads the linked savings
 * line's balance/contribution (0 if unlinked), works out what's required to hit
 * the goal by its deadline, and whether current contributions get there in time.
 */
export function targetStatus(target: Target, plan: ResolvedPlan): TargetStatus {
  const linkedBill = plan.bills.find((b) => b.id === target.linked_bill_id) ?? null;
  const currentBalance = linkedBill ? linkedBill.balance : 0;
  const currentContribution = linkedBill ? monthlyBillAmount(linkedBill) : 0;

  // offset 1 = this month; months from now until the deadline.
  const deadlineOffset = ymToOffset(target.target_ym, plan.nowYM);
  const monthsRemaining = Math.max(0, deadlineOffset - 1);

  const requiredPerMonth = requiredContribution(
    target.target_amount,
    currentBalance,
    monthsRemaining || 1,
    plan.savingsRate,
  );

  const hitOffset = monthGoalHitOffset(
    currentBalance,
    currentContribution,
    plan.savingsRate,
    target.target_amount,
    600,
  );
  const projectedHit = hitOffset ? offsetToYM(hitOffset, plan.nowYM) : null;
  const onTrack = hitOffset !== null && hitOffset <= deadlineOffset;
  const shortfallPerMonth = Math.max(0, requiredPerMonth - currentContribution);

  return {
    target,
    monthsRemaining,
    currentBalance,
    currentContribution,
    requiredPerMonth,
    projectedHit,
    onTrack,
    shortfallPerMonth,
  };
}

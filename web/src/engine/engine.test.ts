import { describe, expect, it } from 'vitest';
import {
  monthGoalHitOffset,
  monthlyBillAmount,
  normalizeFrequency,
  netFromGross,
  project,
  requiredContribution,
  resolveScenario,
  targetStatus,
} from './index';
import type { Bill, Income, PlanState, ResolvedPlan, Target, TaxConfig } from '../types';

// 2026/27 rUK config used throughout.
const TAX: TaxConfig = {
  tax_year: '2026/27',
  region: 'rUK',
  personal_allowance: 12570,
  bands: [
    { threshold: 0, rate: 0.2 },
    { threshold: 37700, rate: 0.4 },
    { threshold: 125140, rate: 0.45 },
  ],
  ni_thresholds: { primary: 12570, upper: 50270, taper_start: 100000 },
  ni_rates: { main: 0.08, upper: 0.02 },
};

// Fixed anchor for deterministic offsets.
const NOW = '2026-01';

describe('normalizeFrequency', () => {
  it('converts each frequency to monthly equivalent', () => {
    expect(normalizeFrequency(100, 'Monthly')).toBe(100);
    expect(normalizeFrequency(300, 'Quarterly')).toBeCloseTo(100, 6);
    expect(normalizeFrequency(1200, 'Annual')).toBe(100);
    expect(normalizeFrequency(100, 'Weekly')).toBeCloseTo((100 * 52) / 12, 6);
    expect(normalizeFrequency(100, '4-weekly')).toBeCloseTo((100 * 13) / 12, 6);
  });
});

describe('netFromGross (known payslip, 2026/27 rUK)', () => {
  it('£50,000 with no pension', () => {
    const b = netFromGross(50000, 0, 'relief_at_source', 0, TAX);
    // Tax: (50000-12570)*0.20 = 7486 ; NI: 37430*0.08 = 2994.40
    expect(b.incomeTax).toBeCloseTo(7486, 2);
    expect(b.nationalInsurance).toBeCloseTo(2994.4, 2);
    expect(b.netAnnual).toBeCloseTo(39519.6, 2);
    expect(b.netMonthly).toBeCloseTo(3293.3, 2);
  });

  it('salary sacrifice reduces both tax and NI', () => {
    const b = netFromGross(50000, 5, 'salary_sacrifice', 0, TAX);
    // payForTaxNi = 47500 ; tax = 34930*0.2 = 6986 ; NI = 34930*0.08 = 2794.40
    expect(b.incomeTax).toBeCloseTo(6986, 2);
    expect(b.nationalInsurance).toBeCloseTo(2794.4, 2);
    expect(b.pensionAnnual).toBeCloseTo(2500, 2);
    expect(b.netAnnual).toBeCloseTo(37719.6, 2);
  });

  it('net_pay reduces taxable but not NI-able pay', () => {
    const b = netFromGross(50000, 5, 'net_pay', 0, TAX);
    expect(b.incomeTax).toBeCloseTo(6986, 2);
    expect(b.nationalInsurance).toBeCloseTo(2994.4, 2); // NI unchanged
    expect(b.netAnnual).toBeCloseTo(37519.6, 2);
  });

  it('relief_at_source taxes full pay and tops up the pot', () => {
    const b = netFromGross(50000, 5, 'relief_at_source', 0, TAX);
    expect(b.incomeTax).toBeCloseTo(7486, 2);
    expect(b.nationalInsurance).toBeCloseTo(2994.4, 2);
    expect(b.reliefAtSourceTopUp).toBeCloseTo(625, 2); // 2500 * 25%
    expect(b.netAnnual).toBeCloseTo(37019.6, 2);
  });

  it('applies the personal-allowance taper above £100k', () => {
    const b = netFromGross(120000, 0, 'relief_at_source', 0, TAX);
    expect(b.personalAllowance).toBeCloseTo(2570, 2); // 12570 - 10000
    expect(b.incomeTax).toBeCloseTo(39432, 2);
    expect(b.nationalInsurance).toBeCloseTo(4410.6, 2);
    expect(b.netAnnual).toBeCloseTo(76157.4, 2);
  });

  it('honours a tax code: 1257L matches the default allowance', () => {
    const code = netFromGross(50000, 0, 'relief_at_source', 0, TAX, '1257L');
    const dflt = netFromGross(50000, 0, 'relief_at_source', 0, TAX);
    expect(code.personalAllowance).toBe(12570);
    expect(code.incomeTax).toBeCloseTo(dflt.incomeTax, 2);
  });

  it('honours a tax code: BR taxes everything at 20% with no allowance', () => {
    const b = netFromGross(50000, 0, 'relief_at_source', 0, TAX, 'BR');
    expect(b.personalAllowance).toBe(0);
    expect(b.incomeTax).toBeCloseTo(10000, 2); // 50000 * 20%
  });

  it('honours a tax code: 0T removes the allowance but keeps the bands', () => {
    const b = netFromGross(50000, 0, 'relief_at_source', 0, TAX, '0T');
    expect(b.personalAllowance).toBe(0);
    // 37700*0.2 + (50000-37700)*0.4 = 7540 + 4920 = 12460
    expect(b.incomeTax).toBeCloseTo(12460, 2);
  });

  it('honours a tax code: K475 adds £4,750 to taxable income', () => {
    const b = netFromGross(50000, 0, 'relief_at_source', 0, TAX, 'K475');
    // taxable = 50000 + 4750 = 54750 → 37700*0.2 + 17050*0.4 = 7540 + 6820 = 14360
    expect(b.personalAllowance).toBe(0);
    expect(b.incomeTax).toBeCloseTo(14360, 2);
  });

  it('honours a tax code: NT means no tax', () => {
    const b = netFromGross(50000, 0, 'relief_at_source', 0, TAX, 'NT');
    expect(b.incomeTax).toBe(0);
  });

  it('ignores W1/M1 emergency suffixes', () => {
    const a = netFromGross(50000, 0, 'relief_at_source', 0, TAX, '1257L W1');
    expect(a.personalAllowance).toBe(12570);
  });
});

// ----------------------------------------------------------------------------
// Builders for the new model.
// ----------------------------------------------------------------------------

function resolved(partial: Partial<ResolvedPlan>): ResolvedPlan {
  return {
    income: [],
    income_oneoff: [],
    bills: [],
    events: [],
    opening_cash: 0,
    savingsRate: 0,
    nowYM: NOW,
    scenarioId: null,
    ...partial,
  };
}

const income = (over: Partial<Income>): Income => ({
  id: 1,
  name: 'Salary',
  entry_mode: 'net',
  frequency: 'Monthly',
  active: true,
  net_amount: 2000,
  gross_annual: null,
  pension_rate: null,
  pension_type: null,
  sacrifice_monthly: null,
  tax_code: null,
  ...over,
});

const bill = (over: Partial<Bill>): Bill => ({
  id: 1,
  name: 'Rent',
  category: 'Housing',
  amount: 500,
  frequency: 'Monthly',
  active: true,
  is_savings: false,
  balance: 0,
  track_actuals: false,
  rate_override: null,
  ...over,
});

const target = (over: Partial<Target>): Target => ({
  id: 1,
  name: 'Pot',
  target_amount: 1200,
  target_ym: '2026-12',
  linked_bill_id: null,
  ...over,
});

describe('project', () => {
  it('rolls cash month by month with income and a spend bill', () => {
    const r = project(
      resolved({ opening_cash: 1000, income: [income({})], bills: [bill({})] }),
      3,
      TAX,
    );
    // netFlow each month = 2000 - 500 = 1500
    expect(r.points.map((p) => p.cash)).toEqual([2500, 4000, 5500]);
    expect(r.points.map((p) => p.spend)).toEqual([500, 500, 500]);
    expect(r.points.map((p) => p.saved)).toEqual([0, 0, 0]);
    expect(r.points[0].ym).toBe('2026-01');
    expect(r.points[2].ym).toBe('2026-03');
    expect(r.lowestCash).toEqual({ offset: 1, ym: '2026-01', value: 2500 });
    expect(r.nowYM).toBe(NOW);
  });

  it('a savings-line bill deducts from cash AND accrues a balance', () => {
    const r = project(
      resolved({
        opening_cash: 1000,
        income: [income({})],
        bills: [bill({ id: 2, name: 'Emergency fund', amount: 100, is_savings: true })],
      }),
      3,
      TAX,
    );
    // saved is reported separately and removed from cash: netFlow = 2000 - 100 = 1900
    expect(r.points.map((p) => p.saved)).toEqual([100, 100, 100]);
    expect(r.points.map((p) => p.spend)).toEqual([0, 0, 0]);
    expect(r.points.map((p) => p.cash)).toEqual([2900, 4800, 6700]);
    // balance grows (0% rate): 100, 200, 300
    expect(r.points.map((p) => p.savingsTotal)).toEqual([100, 200, 300]);
  });

  it('compounds interest on a savings-line balance', () => {
    const r = project(
      resolved({
        savingsRate: 12,
        bills: [bill({ id: 2, name: 'ISA', amount: 0, is_savings: true, balance: 1000 })],
      }),
      1,
      TAX,
    );
    // 1000 * (1 + 0.12/12) + 0 = 1010
    expect(r.points[0].savingsTotal).toBeCloseTo(1010, 6);
  });

  it('compounds a savings line at its rate_override instead of the global rate', () => {
    const r = project(
      resolved({
        savingsRate: 0, // global is 0%
        bills: [bill({ id: 2, name: 'ISA', amount: 0, is_savings: true, balance: 1000, rate_override: 12 })],
      }),
      1,
      TAX,
    );
    // Uses the per-line 12% override, not the 0% global: 1000 * (1 + 0.12/12) = 1010
    expect(r.points[0].savingsTotal).toBeCloseTo(1010, 6);
  });

  it('mixes a per-line override with a globally-rated savings line', () => {
    const r = project(
      resolved({
        savingsRate: 0,
        bills: [
          bill({ id: 2, name: 'ISA', amount: 0, is_savings: true, balance: 1000, rate_override: 12 }),
          bill({ id: 3, name: 'Pot', amount: 0, is_savings: true, balance: 1000, rate_override: null }),
        ],
      }),
      1,
      TAX,
    );
    // ISA grows at 12% → 1010 ; Pot stays at global 0% → 1000 ; total 2010.
    expect(r.points[0].savingsTotal).toBeCloseTo(2010, 6);
  });

  it('an inactive savings line contributes nothing', () => {
    const r = project(
      resolved({ bills: [bill({ id: 2, amount: 100, is_savings: true, active: false })] }),
      2,
      TAX,
    );
    expect(r.points.map((p) => p.saved)).toEqual([0, 0]);
    expect(r.points.map((p) => p.savingsTotal)).toEqual([0, 0]);
  });

  it('applies an absolute-month event over its duration', () => {
    const r = project(
      resolved({
        opening_cash: 0,
        // start 2026-02 = offset 2 (nowYM 2026-01), 3 months → offsets 2,3,4
        events: [{ id: 1, name: 'Holiday', total_cost: 600, start_ym: '2026-02', duration_months: 3, applies_to: 'all' }],
      }),
      5,
      TAX,
    );
    expect(r.points.map((p) => p.events)).toEqual([0, 200, 200, 200, 0]);
  });

  it('lands a one-off bonus in its absolute month', () => {
    const r = project(
      resolved({
        income: [income({})],
        // 2026-03 = offset 3
        income_oneoff: [{ id: 1, name: 'Bonus', gross_amount: 1000, month_ym: '2026-03', pension_sacrifice_pct: null }],
      }),
      4,
      TAX,
    );
    // No gross-entry base income → bonus taxed standalone (net of standard allowance/bands).
    expect(r.points[0].income).toBe(2000);
    expect(r.points[2].income).toBeGreaterThan(2000);
    expect(r.points[3].income).toBe(2000);
  });
});

describe('monthlyBillAmount', () => {
  it('normalises an active bill and zeroes an inactive one', () => {
    expect(monthlyBillAmount(bill({ amount: 1200, frequency: 'Annual' }))).toBeCloseTo(100, 6);
    expect(monthlyBillAmount(bill({ amount: 500, active: false }))).toBe(0);
  });
});

describe('requiredContribution', () => {
  it('zero-rate: simple division', () => {
    expect(requiredContribution(1200, 0, 12, 0)).toBeCloseTo(100, 6);
  });
  it('zero-rate with a starting balance', () => {
    expect(requiredContribution(1200, 600, 12, 0)).toBeCloseTo(50, 6);
  });
  it('with interest: annuity formula', () => {
    const c = requiredContribution(1200, 0, 12, 12);
    expect(c).toBeCloseTo(94.62, 1);
  });
  it('n <= 0 falls back to the bare gap', () => {
    expect(requiredContribution(1200, 500, 0, 12)).toBe(700);
  });
});

describe('monthGoalHitOffset', () => {
  it('finds the month the goal is reached', () => {
    // 100/mo, 0% → hits 1000 at offset 10
    expect(monthGoalHitOffset(0, 100, 0, 1000, 600)).toBe(10);
  });
  it('returns null when unreachable in range', () => {
    expect(monthGoalHitOffset(0, 10, 0, 1000, 12)).toBeNull();
  });
});

describe('targetStatus', () => {
  it('reports on-track when contributions reach the goal by the deadline', () => {
    const plan = resolved({
      savingsRate: 0,
      // linked savings line: balance 0, 110/mo
      bills: [bill({ id: 5, name: 'Holiday fund', amount: 110, is_savings: true, balance: 0 })],
    });
    // target 1200 by 2026-12 (offset 12, monthsRemaining 11). 110*11 = 1210 ≥ 1200.
    const t = target({ target_amount: 1200, target_ym: '2026-12', linked_bill_id: 5 });
    const s = targetStatus(t, plan);
    expect(s.currentBalance).toBe(0);
    expect(s.currentContribution).toBe(110);
    expect(s.monthsRemaining).toBe(11);
    expect(s.onTrack).toBe(true);
    expect(s.shortfallPerMonth).toBe(0);
    expect(s.projectedHit).not.toBeNull();
  });

  it('reports a shortfall when contributions fall short', () => {
    const plan = resolved({
      savingsRate: 0,
      bills: [bill({ id: 5, name: 'Holiday fund', amount: 50, is_savings: true, balance: 0 })],
    });
    // need ~109/mo for 1200 over 11 months; contributing 50 → shortfall.
    const t = target({ target_amount: 1200, target_ym: '2026-12', linked_bill_id: 5 });
    const s = targetStatus(t, plan);
    expect(s.onTrack).toBe(false);
    expect(s.requiredPerMonth).toBeCloseTo(1200 / 11, 4);
    expect(s.shortfallPerMonth).toBeCloseTo(1200 / 11 - 50, 4);
  });

  it('treats an unlinked target as zero balance/contribution', () => {
    const plan = resolved({ savingsRate: 0 });
    const s = targetStatus(target({ linked_bill_id: null }), plan);
    expect(s.currentBalance).toBe(0);
    expect(s.currentContribution).toBe(0);
    expect(s.onTrack).toBe(false);
  });

  it("uses the linked savings line's rate_override for requiredPerMonth", () => {
    // Same target/balance/term, but the linked line carries a 12% override while
    // the global rate is 0%. Interest lowers the required monthly contribution.
    const globalPlan = resolved({
      savingsRate: 0,
      bills: [bill({ id: 5, name: 'Pot', amount: 0, is_savings: true, balance: 0, rate_override: null })],
    });
    const overridePlan = resolved({
      savingsRate: 0,
      bills: [bill({ id: 5, name: 'Pot', amount: 0, is_savings: true, balance: 0, rate_override: 12 })],
    });
    const t = target({ target_amount: 1200, target_ym: '2026-12', linked_bill_id: 5 });

    const sGlobal = targetStatus(t, globalPlan);
    const sOverride = targetStatus(t, overridePlan);

    // 0% global → straight 1200/11 ; 12% override → annuity formula (lower).
    expect(sGlobal.requiredPerMonth).toBeCloseTo(1200 / 11, 4);
    expect(sOverride.requiredPerMonth).toBeCloseTo(requiredContribution(1200, 0, 11, 12), 6);
    expect(sOverride.requiredPerMonth).toBeLessThan(sGlobal.requiredPerMonth);
  });
});

describe('resolveScenario', () => {
  // resolveScenario takes a plan-like slice (settings/income/income_oneoff/bills/
  // events), not a full PlanState — a scenario passes its own decoded copy.
  function planSlice(): Pick<PlanState, 'settings' | 'income' | 'income_oneoff' | 'bills' | 'events'> {
    return {
      settings: {
        id: 1,
        opening_cash: 1500,
        projection_months_default: 24,
        currency: 'GBP',
        tax_year: '2026/27',
        default_savings_rate: 3,
      },
      income: [income({ id: 1, net_amount: 2000 })],
      income_oneoff: [],
      bills: [
        bill({ id: 1, amount: 500 }),
        bill({ id: 2, name: 'Gym', amount: 40 }),
        bill({ id: 3, name: 'ISA', amount: 100, is_savings: true }),
      ],
      events: [
        { id: 1, name: 'All event', total_cost: 100, start_ym: '2026-02', duration_months: 1, applies_to: 'all' },
        { id: 2, name: 'Sc event', total_cost: 200, start_ym: '2026-03', duration_months: 1, applies_to: '7' },
      ],
    };
  }

  it('maps a plan slice straight into a ResolvedPlan', () => {
    const slice = planSlice();
    const rp = resolveScenario(slice, '2026-01');
    // Income / bills / income_oneoff pass through untouched.
    expect(rp.income).toEqual(slice.income);
    expect(rp.income[0].net_amount).toBe(2000);
    expect(rp.bills.map((b) => b.id)).toEqual([1, 2, 3]);
    expect(rp.bills.find((b) => b.id === 2)!.active).toBe(true);
    expect(rp.income_oneoff).toEqual([]);
    // All events are kept — no per-scenario applies_to filtering anymore.
    expect(rp.events.map((e) => e.id)).toEqual([1, 2]);
    // Anchor + settings-derived fields.
    expect(rp.opening_cash).toBe(1500);
    expect(rp.savingsRate).toBe(3);
    expect(rp.nowYM).toBe('2026-01');
    expect(rp.scenarioId).toBeNull();
  });

  it('accepts a minimal plan-like object literal', () => {
    const rp = resolveScenario(
      {
        settings: {
          id: 1,
          opening_cash: 42,
          projection_months_default: 12,
          currency: 'GBP',
          tax_year: '2026/27',
          default_savings_rate: 5,
        },
        income: [income({})],
        income_oneoff: [],
        bills: [bill({})],
        events: [],
      },
      '2026-01',
    );
    expect(rp.opening_cash).toBe(42);
    expect(rp.savingsRate).toBe(5);
    expect(rp.events).toEqual([]);
    expect(rp.scenarioId).toBeNull();
  });
});

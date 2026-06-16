import { describe, expect, it } from 'vitest';
import { normalizeFrequency, netFromGross, project, requiredContribution, resolveScenario } from './index';
import type { Bill, Income, PlanState, ResolvedPlan, SavingsTarget, TaxConfig } from '../types';

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
});

function resolved(partial: Partial<ResolvedPlan>): ResolvedPlan {
  return {
    income: [],
    income_oneoff: [],
    bills: [],
    savings_targets: [],
    events: [],
    opening_cash: 0,
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
  ...over,
});

const bill = (over: Partial<Bill>): Bill => ({
  id: 1,
  name: 'Rent',
  category: 'Housing',
  amount: 500,
  frequency: 'Monthly',
  active: true,
  ...over,
});

const target = (over: Partial<SavingsTarget>): SavingsTarget => ({
  id: 1,
  name: 'Pot',
  balance: 0,
  monthly_contribution: 100,
  annual_rate: 0,
  target_amount: null,
  target_month: null,
  ring_fenced: true,
  ...over,
});

describe('project', () => {
  it('rolls cash and compounds savings month by month', () => {
    const r = project(
      resolved({
        opening_cash: 1000,
        income: [income({})],
        bills: [bill({})],
        savings_targets: [target({})],
      }),
      3,
      TAX,
    );
    expect(r.points.map((p) => p.cash)).toEqual([2400, 3800, 5200]);
    expect(r.points.map((p) => p.savingsTotal)).toEqual([100, 200, 300]);
    expect(r.lowestCash).toEqual({ month: 1, value: 2400 });
    expect(r.targets[0].endBalance).toBe(300);
  });

  it('compounds interest on the savings balance', () => {
    const r = project(resolved({ savings_targets: [target({ balance: 1000, monthly_contribution: 0, annual_rate: 12 })] }), 1, TAX);
    // 1000 * (1 + 0.12/12) = 1010
    expect(r.targets[0].balances[0]).toBeCloseTo(1010, 6);
  });

  it('applies events over their duration', () => {
    const r = project(
      resolved({
        opening_cash: 0,
        events: [{ id: 1, name: 'Holiday', total_cost: 600, start_month: 2, duration_months: 3, applies_to: 'all' }],
      }),
      4,
      TAX,
    );
    expect(r.points.map((p) => p.events)).toEqual([0, 200, 200, 200]);
  });
});

describe('requiredContribution', () => {
  it('zero-rate: simple division', () => {
    expect(requiredContribution(target({ target_amount: 1200, balance: 0, annual_rate: 0 }), 12)).toBeCloseTo(100, 6);
  });
  it('with interest: annuity formula', () => {
    const c = requiredContribution(target({ target_amount: 1200, balance: 0, annual_rate: 12 }), 12);
    expect(c).toBeCloseTo(94.62, 1);
  });
});

describe('resolveScenario', () => {
  it('applies overrides (0 cancels, value replaces, absent unchanged)', () => {
    const plan: PlanState = {
      settings: { id: 1, opening_cash: 0, projection_months_default: 24, currency: 'GBP', tax_year: '2026/27' },
      income: [income({ id: 1, net_amount: 2000 })],
      income_oneoff: [],
      bills: [bill({ id: 1, amount: 500 }), bill({ id: 2, name: 'Gym', amount: 40 })],
      savings_targets: [],
      events: [],
      scenarios: [{ id: 7, name: 'Cut gym', type: 'adjustment', target_id: null, created_at: '' }],
      scenario_overrides: [
        { id: 1, scenario_id: 7, item_type: 'bill', item_id: 2, override_amount: 0 },
        { id: 2, scenario_id: 7, item_type: 'income', item_id: 1, override_amount: 2500 },
      ],
    };
    const rp = resolveScenario(plan, 7);
    expect(rp.income[0].net_amount).toBe(2500);
    expect(rp.bills.find((b) => b.id === 2)!.active).toBe(false);
    expect(rp.bills.find((b) => b.id === 1)!.amount).toBe(500);
  });
});

// ============================================================================
// Shared TypeScript contract for Money Dashboard.
// Everything (worker mirror, engine, UI) depends on these types.
// Keep field names in lock-step with the migrations.
// ============================================================================

import type { YM } from './lib/calendar';

export type Frequency = 'Monthly' | 'Quarterly' | 'Annual' | 'Weekly' | '4-weekly';
export const FREQUENCIES: Frequency[] = ['Monthly', 'Quarterly', 'Annual', 'Weekly', '4-weekly'];

export type EntryMode = 'net' | 'gross';
export type PensionType = 'salary_sacrifice' | 'net_pay' | 'relief_at_source';

// ----------------------------------------------------------------------------
// Persisted entities
// ----------------------------------------------------------------------------

export interface Settings {
  id: 1;
  opening_cash: number;
  projection_months_default: number;
  currency: string;
  tax_year: string;
  default_savings_rate: number; // global annual interest rate (%) for savings lines
}

export interface Income {
  id: number;
  name: string;
  entry_mode: EntryMode;
  frequency: Frequency;
  active: boolean;
  net_amount: number | null;
  gross_annual: number | null;
  pension_rate: number | null;
  pension_type: PensionType | null;
  sacrifice_monthly: number | null;
  tax_code: string | null;
}

export interface IncomeOneoff {
  id: number;
  name: string;
  gross_amount: number;
  month_ym: YM; // absolute month, 'YYYY-MM'
  pension_sacrifice_pct: number | null;
}

// An "outgoing". A normal bill spends; a savings line (is_savings) sets money
// aside — it still reduces available-to-spend but accrues into `balance` and is
// reported as savings rather than spent.
export interface Bill {
  id: number;
  name: string;
  category: string | null;
  amount: number;
  frequency: Frequency;
  active: boolean;
  is_savings: boolean;
  balance: number;        // accrued balance (savings lines only)
  track_actuals: boolean; // opt-in: this (variable) line shows quick actual-spend logging
  rate_override: number | null; // savings line: annual % overriding the global default
}

// A lightweight savings goal overlay. Optionally tied to a savings line (bucket).
export interface Target {
  id: number;
  name: string;
  target_amount: number;
  target_ym: YM;                  // absolute deadline 'YYYY-MM'
  linked_bill_id: number | null;  // a savings-line bill it fills
}

export interface PlanEvent {
  id: number;
  name: string;
  total_cost: number;
  start_ym: YM;          // absolute start month
  duration_months: number;
  applies_to: string;    // 'all' (base) — scenarios carry their own events in their copy
}

// A scenario is a full, independent copy of the editable plan, stored as JSON in
// `payload`. Editing a scenario never touches the base plan.
export interface Scenario {
  id: number;
  name: string;
  payload: string;       // JSON.stringify(ScenarioPlan)
  created_at: string;
}

// The editable slice of a plan that a scenario clones.
export type ScenarioPlan = Pick<PlanState, 'settings' | 'income' | 'income_oneoff' | 'bills' | 'targets' | 'events'>;

export interface PlanState {
  settings: Settings;
  income: Income[];
  income_oneoff: IncomeOneoff[];
  bills: Bill[];
  targets: Target[];
  events: PlanEvent[];
  scenarios: Scenario[];
}

// ----------------------------------------------------------------------------
// Tax configuration
// ----------------------------------------------------------------------------

export interface TaxBand {
  threshold: number;
  rate: number;
}
export interface NiThresholds {
  primary: number;
  upper: number;
  taper_start?: number;
}
export interface NiRates {
  main: number;
  upper: number;
}
export interface TaxConfig {
  tax_year: string;
  region: string;
  personal_allowance: number;
  bands: TaxBand[];
  ni_thresholds: NiThresholds;
  ni_rates: NiRates;
}

// ----------------------------------------------------------------------------
// Snapshots & actuals (over-time data) — actuals are now opt-in per line.
// ----------------------------------------------------------------------------

export interface Snapshot {
  id: number;
  taken_on: string;
  label: string | null;
  payload: string;
  m_free_cash: number | null;
  m_bills: number | null;
  m_cash_bal: number | null;
  m_savings_total: number | null;
}

export interface Actual {
  id: number;
  period: string; // 'YYYY-MM'
  bill_id: number;
  planned_amount: number | null;
  actual_amount: number | null;
  note: string | null;
}

// ----------------------------------------------------------------------------
// Open banking (GoCardless Bank Account Data)
// ----------------------------------------------------------------------------

export interface ObInstitution {
  id: string;
  name: string;
  bic?: string;
  logo?: string;
  transaction_total_days?: string;
}
export interface ObRequisition {
  id: string;
  link: string;
  status: string;
  accounts: string[];
}
export interface ObAccount {
  id: string;
  iban?: string;
  name?: string;
  ownerName?: string;
  currency?: string;
}
export interface ObTransaction {
  transactionId?: string;
  bookingDate?: string;
  valueDate?: string;
  amount: number;
  currency: string;
  description: string;
  raw?: unknown;
}

// ============================================================================
// ENGINE CONTRACT — pure TS, client-side. Implemented in web/src/engine/*.
// ============================================================================

export interface ProjectionPoint {
  offset: number;        // 1..horizon
  ym: YM;                // absolute month for this point
  income: number;        // monthly net income (+ any bonus this month)
  spend: number;         // non-savings bills
  saved: number;         // savings-line contributions this month
  events: number;        // event cost this month
  netFlow: number;       // income - spend - saved - events
  cash: number;          // running cash balance
  savingsTotal: number;  // sum of savings-line balances this month
}

export interface ProjectionResult {
  points: ProjectionPoint[];
  lowestCash: { offset: number; ym: YM; value: number };
  horizon: number;
  nowYM: YM;
}

// Effective plan after applying a scenario's overrides + the projection anchor.
export interface ResolvedPlan {
  income: Income[];
  income_oneoff: IncomeOneoff[];
  bills: Bill[];              // includes savings lines (is_savings)
  events: PlanEvent[];
  opening_cash: number;
  savingsRate: number;       // global annual % for savings lines
  nowYM: YM;
  scenarioId: number | null;
}

export interface TargetStatus {
  target: Target;
  monthsRemaining: number;
  currentBalance: number;       // linked savings line balance (0 if unlinked)
  currentContribution: number;  // linked savings line monthly amount (0 if unlinked)
  requiredPerMonth: number;     // to hit target by deadline (with global interest)
  projectedHit: YM | null;      // when current contributions actually reach the goal
  onTrack: boolean;             // projectedHit on or before the deadline
  shortfallPerMonth: number;    // extra £/mo needed (0 if on track)
}

export interface PayBreakdown {
  grossAnnual: number;
  pensionAnnual: number;
  taxableIncome: number;
  incomeTax: number;
  nationalInsurance: number;
  personalAllowance: number;
  netAnnual: number;
  netMonthly: number;
  reliefAtSourceTopUp: number;
}

// ----------------------------------------------------------------------------
// Helpers / defaults
// ----------------------------------------------------------------------------

import { currentYM } from './lib/calendar';

export const emptyPlan = (): PlanState => ({
  settings: {
    id: 1,
    opening_cash: 0,
    projection_months_default: 24,
    currency: 'GBP',
    tax_year: '2026/27',
    default_savings_rate: 0,
  },
  income: [],
  income_oneoff: [],
  bills: [],
  targets: [],
  events: [],
  scenarios: [],
});

export const todayYM = (): YM => currentYM();

export const gbp = (n: number): string =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0,
  );

export const gbp2 = (n: number): string =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

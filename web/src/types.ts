// ============================================================================
// Shared TypeScript contract for the Budget & Scenario Planner.
// EVERY part of the app (worker mirror, engine, UI) depends on these types.
// Keep field names in lock-step with migrations/0001_init.sql.
// ============================================================================

export type Frequency = 'Monthly' | 'Quarterly' | 'Annual' | 'Weekly' | '4-weekly';

export const FREQUENCIES: Frequency[] = ['Monthly', 'Quarterly', 'Annual', 'Weekly', '4-weekly'];

export type EntryMode = 'net' | 'gross';
export type PensionType = 'salary_sacrifice' | 'net_pay' | 'relief_at_source';
export type ScenarioType = 'adjustment' | 'target';
export type ItemType = 'income' | 'bill' | 'savings';

// ----------------------------------------------------------------------------
// Persisted entities (1:1 with DB rows; integers booleans become real booleans
// after normalisation in the API client).
// ----------------------------------------------------------------------------

export interface Settings {
  id: 1;
  opening_cash: number;
  projection_months_default: number;
  currency: string;
  tax_year: string;
}

export interface Income {
  id: number;
  name: string;
  entry_mode: EntryMode;
  frequency: Frequency;
  active: boolean;
  net_amount: number | null;
  gross_annual: number | null;
  pension_rate: number | null;       // percent, e.g. 5 = 5%
  pension_type: PensionType | null;
  sacrifice_monthly: number | null;  // £/month of salary-sacrifice items (e.g. benefits)
}

export interface IncomeOneoff {
  id: number;
  name: string;
  gross_amount: number;
  month: number;                     // 1..horizon offset from "now"
  pension_sacrifice_pct: number | null;
}

export interface Bill {
  id: number;
  name: string;
  category: string | null;
  amount: number;
  frequency: Frequency;
  active: boolean;
}

export interface SavingsTarget {
  id: number;
  name: string;
  balance: number;
  monthly_contribution: number;
  annual_rate: number;               // percent, e.g. 4 = 4%
  target_amount: number | null;      // set => goal
  target_month: number | null;       // set => goal deadline (1..horizon)
  ring_fenced: boolean;
}

export interface PlanEvent {
  id: number;
  name: string;
  total_cost: number;
  start_month: number;               // 1..horizon
  duration_months: number;
  applies_to: string;                // 'all' | scenario id (as string)
}

export interface Scenario {
  id: number;
  name: string;
  type: ScenarioType;
  target_id: number | null;          // for 'target' scenarios: the savings_target id
  created_at: string;
}

export interface ScenarioOverride {
  id: number;
  scenario_id: number;
  item_type: ItemType;
  item_id: number;
  override_amount: number | null;    // NULL = unchanged, 0 = cancelled
}

// ----------------------------------------------------------------------------
// Whole-document plan (the payload of GET/PUT /api/state).
// ----------------------------------------------------------------------------

export interface PlanState {
  settings: Settings;
  income: Income[];
  income_oneoff: IncomeOneoff[];
  bills: Bill[];
  savings_targets: SavingsTarget[];
  events: PlanEvent[];
  scenarios: Scenario[];
  scenario_overrides: ScenarioOverride[];
}

// ----------------------------------------------------------------------------
// Tax configuration
// ----------------------------------------------------------------------------

export interface TaxBand {
  threshold: number;                 // taxable income (after allowances) where this rate starts
  rate: number;                      // fraction, e.g. 0.20
}

export interface NiThresholds {
  primary: number;                   // annualised primary threshold
  upper: number;                     // annualised upper earnings limit
  taper_start?: number;              // PA taper start (default 100000)
}

export interface NiRates {
  main: number;                      // fraction between primary & upper
  upper: number;                     // fraction above upper
}

export interface TaxConfig {
  tax_year: string;
  region: string;                    // 'rUK'
  personal_allowance: number;
  bands: TaxBand[];
  ni_thresholds: NiThresholds;
  ni_rates: NiRates;
}

// ----------------------------------------------------------------------------
// Snapshots & actuals (over-time data)
// ----------------------------------------------------------------------------

export interface Snapshot {
  id: number;
  taken_on: string;
  label: string | null;
  payload: string;                   // JSON-stringified PlanState at capture time
  m_free_cash: number | null;
  m_bills: number | null;
  m_cash_bal: number | null;
  m_savings_total: number | null;
}

export interface Actual {
  id: number;
  period: string;                    // 'YYYY-MM'
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
  link: string;                      // consent URL the user visits
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
  amount: number;                    // signed; negative = money out
  currency: string;
  description: string;
  raw?: unknown;
}

// ============================================================================
// ENGINE CONTRACT — pure TS, runs client-side. Implemented in web/src/engine/*.
// UI and tests import from 'web/src/engine'. Signatures are frozen here.
// ============================================================================

// Per-month projection point for the whole plan / a scenario.
export interface ProjectionPoint {
  month: number;                     // 1..horizon
  income: number;                    // monthly income (normalised)
  bills: number;                     // monthly bills (normalised)
  events: number;                    // event cost falling in this month
  contributions: number;            // total savings contributions this month
  netFlow: number;                   // income - bills - events - contributions
  cash: number;                      // running cash balance
  savingsTotal: number;             // sum of all target balances this month
}

export interface TargetProjection {
  targetId: number;
  name: string;
  balances: number[];                // balance at end of each month, length = horizon
  endBalance: number;
}

export interface ProjectionResult {
  points: ProjectionPoint[];
  targets: TargetProjection[];
  lowestCash: { month: number; value: number };
  horizon: number;
}

// Effective (resolved) plan lines after applying a scenario's overrides.
export interface ResolvedPlan {
  income: Income[];
  bills: Bill[];
  savings_targets: SavingsTarget[];
  events: PlanEvent[];               // events applicable to this scenario (+ 'all')
  opening_cash: number;
  scenarioId: number | null;
}

export interface PayBreakdown {
  grossAnnual: number;
  pensionAnnual: number;             // total pension/sacrifice removed pre-take-home
  taxableIncome: number;
  incomeTax: number;
  nationalInsurance: number;
  personalAllowance: number;         // after taper
  netAnnual: number;
  netMonthly: number;
  reliefAtSourceTopUp: number;       // basic-rate relief added to the pot (RAS only)
}

export interface EngineApi {
  normalizeFrequency(amount: number, f: Frequency): number;
  project(plan: ResolvedPlan, horizon: number): ProjectionResult;
  resolveScenario(plan: PlanState, scenarioId: number | null): ResolvedPlan;
  requiredContribution(target: SavingsTarget, monthsRemaining: number): number;
  netFromGross(
    grossAnnual: number,
    pensionRate: number,             // percent
    pensionType: PensionType,
    sacrificeMonthly: number,
    taxConfig: TaxConfig,
  ): PayBreakdown;
}

// ----------------------------------------------------------------------------
// Helpers / defaults
// ----------------------------------------------------------------------------

export const emptyPlan = (): PlanState => ({
  settings: { id: 1, opening_cash: 0, projection_months_default: 24, currency: 'GBP', tax_year: '2026/27' },
  income: [],
  income_oneoff: [],
  bills: [],
  savings_targets: [],
  events: [],
  scenarios: [],
  scenario_overrides: [],
});

export const gbp = (n: number): string =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);

export const gbp2 = (n: number): string =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

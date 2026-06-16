-- Budget & Scenario Planner — initial schema
-- Single user, GBP, UK (Northern Ireland — rUK tax bands).

CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  opening_cash REAL NOT NULL DEFAULT 0,
  projection_months_default INTEGER NOT NULL DEFAULT 24,
  currency TEXT NOT NULL DEFAULT 'GBP',
  tax_year TEXT NOT NULL DEFAULT '2026/27'
);

CREATE TABLE income (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  entry_mode TEXT NOT NULL DEFAULT 'net',          -- 'net' | 'gross'
  frequency TEXT NOT NULL DEFAULT 'Monthly',
  active INTEGER NOT NULL DEFAULT 1,
  net_amount REAL,
  gross_annual REAL,
  pension_rate REAL,
  pension_type TEXT,                               -- 'salary_sacrifice' | 'net_pay' | 'relief_at_source'
  sacrifice_monthly REAL
);

CREATE TABLE income_oneoff (                       -- bonuses
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  gross_amount REAL NOT NULL,
  month INTEGER NOT NULL,
  pension_sacrifice_pct REAL
);

CREATE TABLE bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  amount REAL NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'Monthly',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE savings_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0,
  monthly_contribution REAL NOT NULL DEFAULT 0,
  annual_rate REAL NOT NULL DEFAULT 0,
  target_amount REAL,
  target_month INTEGER,                            -- set => goal
  ring_fenced INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  total_cost REAL NOT NULL DEFAULT 0,
  start_month INTEGER NOT NULL DEFAULT 1,
  duration_months INTEGER NOT NULL DEFAULT 1,
  applies_to TEXT NOT NULL DEFAULT 'all'           -- 'all' | scenario id (as text)
);

CREATE TABLE scenarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'adjustment',         -- 'adjustment' | 'target'
  target_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE scenario_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_id INTEGER NOT NULL,
  item_type TEXT NOT NULL,                          -- 'income' | 'bill' | 'savings'
  item_id INTEGER NOT NULL,
  override_amount REAL                              -- NULL unchanged, 0 cancelled
);

CREATE TABLE snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  taken_on TEXT NOT NULL DEFAULT (datetime('now')),
  label TEXT,
  payload TEXT NOT NULL,
  m_free_cash REAL,
  m_bills REAL,
  m_cash_bal REAL,
  m_savings_total REAL
);

CREATE TABLE actuals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,                             -- 'YYYY-MM'
  bill_id INTEGER NOT NULL,
  planned_amount REAL,
  actual_amount REAL,
  note TEXT
);

CREATE TABLE tax_config (
  tax_year TEXT PRIMARY KEY,
  region TEXT NOT NULL DEFAULT 'rUK',
  personal_allowance REAL NOT NULL,
  bands TEXT NOT NULL,
  ni_thresholds TEXT NOT NULL,
  ni_rates TEXT NOT NULL
);

INSERT INTO settings (id) VALUES (1);

-- 2026/27 rUK figures (thresholds frozen; PA tapers above £100k to zero at £125,140).
-- bands: taxable-income thresholds at which each marginal rate STARTS (after allowances).
-- ni_thresholds / ni_rates: annualised primary threshold & upper earnings limit.
INSERT INTO tax_config (tax_year, region, personal_allowance, bands, ni_thresholds, ni_rates)
VALUES (
  '2026/27',
  'rUK',
  12570,
  '[{"threshold":0,"rate":0.20},{"threshold":37700,"rate":0.40},{"threshold":125140,"rate":0.45}]',
  '{"primary":12570,"upper":50270,"taper_start":100000}',
  '{"main":0.08,"upper":0.02}'
);

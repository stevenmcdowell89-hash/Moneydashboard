// ============================================================================
// D1 persistence helpers.
//
// The plan document (settings + 8 list tables) is the single source of truth in
// the browser. On PUT /api/state we replace the whole document transactionally
// using env.DB.batch([...]) so partial writes never persist.
//
// ID strategy for the whole-document replace:
//   The client holds the in-memory document and assigns STABLE ids to every row
//   (positive ids that came from the DB, negative temp ids for unsaved rows).
//   scenario_overrides reference item ids and scenario ids, and events.applies_to
//   references scenario ids, so referential integrity must be preserved across a
//   save. The robust approach used here: WIPE all 8 plan tables, then re-INSERT
//   every row with its client-supplied id EXACTLY (explicit id column). This keeps
//   overrides/events pointing at the right rows. Negative temp ids are perfectly
//   valid INTEGER PRIMARY KEYs in SQLite, so they round-trip fine; the next GET
//   returns them unchanged and the client keeps using them. AUTOINCREMENT only
//   governs auto-assigned ids, which we never request here.
// ============================================================================

import type {
  PlanState,
  Settings,
  Income,
  IncomeOneoff,
  Bill,
  SavingsTarget,
  PlanEvent,
  Scenario,
  ScenarioOverride,
  Snapshot,
  Actual,
  TaxConfig,
} from './index';

const DEFAULT_SETTINGS: Settings = {
  id: 1,
  opening_cash: 0,
  projection_months_default: 24,
  currency: 'GBP',
  tax_year: '2026/27',
};

// SQLite stores booleans as 0/1; convert to real JS booleans for the contract.
const toBool = (v: unknown): boolean => v === 1 || v === true || v === '1';
const fromBool = (v: boolean): number => (v ? 1 : 0);

// ---------------------------------------------------------------------------
// Read the whole plan document.
// ---------------------------------------------------------------------------
export async function readState(db: D1Database): Promise<PlanState> {
  const [
    settingsRow,
    incomeRows,
    oneoffRows,
    billRows,
    savingsRows,
    eventRows,
    scenarioRows,
    overrideRows,
  ] = await Promise.all([
    db.prepare('SELECT * FROM settings WHERE id = 1').first<Record<string, unknown>>(),
    db.prepare('SELECT * FROM income').all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM income_oneoff').all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM bills').all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM savings_targets').all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM events').all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM scenarios').all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM scenario_overrides').all<Record<string, unknown>>(),
  ]);

  const settings: Settings = settingsRow
    ? {
        id: 1,
        opening_cash: Number(settingsRow.opening_cash ?? 0),
        projection_months_default: Number(settingsRow.projection_months_default ?? 24),
        currency: String(settingsRow.currency ?? 'GBP'),
        tax_year: String(settingsRow.tax_year ?? '2026/27'),
      }
    : { ...DEFAULT_SETTINGS };

  const income: Income[] = (incomeRows.results ?? []).map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    entry_mode: r.entry_mode as Income['entry_mode'],
    frequency: r.frequency as Income['frequency'],
    active: toBool(r.active),
    net_amount: r.net_amount === null || r.net_amount === undefined ? null : Number(r.net_amount),
    gross_annual: r.gross_annual === null || r.gross_annual === undefined ? null : Number(r.gross_annual),
    pension_rate: r.pension_rate === null || r.pension_rate === undefined ? null : Number(r.pension_rate),
    pension_type: (r.pension_type ?? null) as Income['pension_type'],
    sacrifice_monthly:
      r.sacrifice_monthly === null || r.sacrifice_monthly === undefined ? null : Number(r.sacrifice_monthly),
  }));

  const income_oneoff: IncomeOneoff[] = (oneoffRows.results ?? []).map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    gross_amount: Number(r.gross_amount),
    month: Number(r.month),
    pension_sacrifice_pct:
      r.pension_sacrifice_pct === null || r.pension_sacrifice_pct === undefined
        ? null
        : Number(r.pension_sacrifice_pct),
  }));

  const bills: Bill[] = (billRows.results ?? []).map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    category: (r.category ?? null) as string | null,
    amount: Number(r.amount),
    frequency: r.frequency as Bill['frequency'],
    active: toBool(r.active),
  }));

  const savings_targets: SavingsTarget[] = (savingsRows.results ?? []).map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    balance: Number(r.balance),
    monthly_contribution: Number(r.monthly_contribution),
    annual_rate: Number(r.annual_rate),
    target_amount: r.target_amount === null || r.target_amount === undefined ? null : Number(r.target_amount),
    target_month: r.target_month === null || r.target_month === undefined ? null : Number(r.target_month),
    ring_fenced: toBool(r.ring_fenced),
  }));

  const events: PlanEvent[] = (eventRows.results ?? []).map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    total_cost: Number(r.total_cost),
    start_month: Number(r.start_month),
    duration_months: Number(r.duration_months),
    applies_to: String(r.applies_to),
  }));

  const scenarios: Scenario[] = (scenarioRows.results ?? []).map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    type: r.type as Scenario['type'],
    target_id: r.target_id === null || r.target_id === undefined ? null : Number(r.target_id),
    created_at: String(r.created_at),
  }));

  const scenario_overrides: ScenarioOverride[] = (overrideRows.results ?? []).map((r) => ({
    id: Number(r.id),
    scenario_id: Number(r.scenario_id),
    item_type: r.item_type as ScenarioOverride['item_type'],
    item_id: Number(r.item_id),
    override_amount:
      r.override_amount === null || r.override_amount === undefined ? null : Number(r.override_amount),
  }));

  return {
    settings,
    income,
    income_oneoff,
    bills,
    savings_targets,
    events,
    scenarios,
    scenario_overrides,
  };
}

// ---------------------------------------------------------------------------
// Replace the whole plan document transactionally.
// All statements run in a single batch (implicit transaction in D1).
// ---------------------------------------------------------------------------
export async function writeState(db: D1Database, state: PlanState): Promise<void> {
  const stmts: D1PreparedStatement[] = [];

  // Wipe the 8 plan tables (settings handled via upsert below).
  for (const table of [
    'income',
    'income_oneoff',
    'bills',
    'savings_targets',
    'events',
    'scenarios',
    'scenario_overrides',
  ]) {
    stmts.push(db.prepare(`DELETE FROM ${table}`));
  }

  // Upsert settings id = 1.
  const s = state.settings ?? DEFAULT_SETTINGS;
  stmts.push(
    db
      .prepare(
        `INSERT INTO settings (id, opening_cash, projection_months_default, currency, tax_year)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           opening_cash = excluded.opening_cash,
           projection_months_default = excluded.projection_months_default,
           currency = excluded.currency,
           tax_year = excluded.tax_year`,
      )
      .bind(s.opening_cash, s.projection_months_default, s.currency, s.tax_year),
  );

  // Re-insert every row with its client-supplied id EXACTLY (see header note).
  for (const r of state.income ?? []) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO income
             (id, name, entry_mode, frequency, active, net_amount, gross_annual, pension_rate, pension_type, sacrifice_monthly)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          r.id,
          r.name,
          r.entry_mode,
          r.frequency,
          fromBool(r.active),
          r.net_amount,
          r.gross_annual,
          r.pension_rate,
          r.pension_type,
          r.sacrifice_monthly,
        ),
    );
  }

  for (const r of state.income_oneoff ?? []) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO income_oneoff (id, name, gross_amount, month, pension_sacrifice_pct)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(r.id, r.name, r.gross_amount, r.month, r.pension_sacrifice_pct),
    );
  }

  for (const r of state.bills ?? []) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO bills (id, name, category, amount, frequency, active)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(r.id, r.name, r.category, r.amount, r.frequency, fromBool(r.active)),
    );
  }

  for (const r of state.savings_targets ?? []) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO savings_targets
             (id, name, balance, monthly_contribution, annual_rate, target_amount, target_month, ring_fenced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          r.id,
          r.name,
          r.balance,
          r.monthly_contribution,
          r.annual_rate,
          r.target_amount,
          r.target_month,
          fromBool(r.ring_fenced),
        ),
    );
  }

  for (const r of state.events ?? []) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO events (id, name, total_cost, start_month, duration_months, applies_to)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(r.id, r.name, r.total_cost, r.start_month, r.duration_months, r.applies_to),
    );
  }

  for (const r of state.scenarios ?? []) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO scenarios (id, name, type, target_id, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(r.id, r.name, r.type, r.target_id, r.created_at ?? new Date().toISOString()),
    );
  }

  for (const r of state.scenario_overrides ?? []) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO scenario_overrides (id, scenario_id, item_type, item_id, override_amount)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(r.id, r.scenario_id, r.item_type, r.item_id, r.override_amount),
    );
  }

  await db.batch(stmts);
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------
export async function listSnapshots(db: D1Database): Promise<Snapshot[]> {
  const { results } = await db
    .prepare('SELECT * FROM snapshots ORDER BY id DESC')
    .all<Record<string, unknown>>();
  return (results ?? []).map(rowToSnapshot);
}

export async function createSnapshot(
  db: D1Database,
  s: Pick<Snapshot, 'label' | 'payload' | 'm_free_cash' | 'm_bills' | 'm_cash_bal' | 'm_savings_total'>,
): Promise<Snapshot> {
  const row = await db
    .prepare(
      `INSERT INTO snapshots (label, payload, m_free_cash, m_bills, m_cash_bal, m_savings_total)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .bind(
      s.label ?? null,
      s.payload,
      s.m_free_cash ?? null,
      s.m_bills ?? null,
      s.m_cash_bal ?? null,
      s.m_savings_total ?? null,
    )
    .first<Record<string, unknown>>();
  return rowToSnapshot(row as Record<string, unknown>);
}

export async function deleteSnapshot(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM snapshots WHERE id = ?').bind(id).run();
}

function rowToSnapshot(r: Record<string, unknown>): Snapshot {
  return {
    id: Number(r.id),
    taken_on: String(r.taken_on),
    label: (r.label ?? null) as string | null,
    payload: String(r.payload),
    m_free_cash: r.m_free_cash === null || r.m_free_cash === undefined ? null : Number(r.m_free_cash),
    m_bills: r.m_bills === null || r.m_bills === undefined ? null : Number(r.m_bills),
    m_cash_bal: r.m_cash_bal === null || r.m_cash_bal === undefined ? null : Number(r.m_cash_bal),
    m_savings_total:
      r.m_savings_total === null || r.m_savings_total === undefined ? null : Number(r.m_savings_total),
  };
}

// ---------------------------------------------------------------------------
// Actuals (per period 'YYYY-MM')
// ---------------------------------------------------------------------------
export async function getActuals(db: D1Database, period: string): Promise<Actual[]> {
  const { results } = await db
    .prepare('SELECT * FROM actuals WHERE period = ? ORDER BY id')
    .bind(period)
    .all<Record<string, unknown>>();
  return (results ?? []).map((r) => ({
    id: Number(r.id),
    period: String(r.period),
    bill_id: Number(r.bill_id),
    planned_amount:
      r.planned_amount === null || r.planned_amount === undefined ? null : Number(r.planned_amount),
    actual_amount:
      r.actual_amount === null || r.actual_amount === undefined ? null : Number(r.actual_amount),
    note: (r.note ?? null) as string | null,
  }));
}

// Replace all actual rows for a period with the posted array.
export async function putActuals(
  db: D1Database,
  period: string,
  rows: Omit<Actual, 'id'>[],
): Promise<Actual[]> {
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM actuals WHERE period = ?').bind(period),
  ];
  for (const r of rows) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO actuals (period, bill_id, planned_amount, actual_amount, note)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(period, r.bill_id, r.planned_amount ?? null, r.actual_amount ?? null, r.note ?? null),
    );
  }
  await db.batch(stmts);
  return getActuals(db, period);
}

// ---------------------------------------------------------------------------
// Tax config
// ---------------------------------------------------------------------------
export async function getTaxConfig(db: D1Database, taxYear?: string): Promise<TaxConfig | null> {
  const row = taxYear
    ? await db
        .prepare('SELECT * FROM tax_config WHERE tax_year = ?')
        .bind(taxYear)
        .first<Record<string, unknown>>()
    : await db
        .prepare('SELECT * FROM tax_config ORDER BY tax_year DESC LIMIT 1')
        .first<Record<string, unknown>>();
  if (!row) return null;
  return {
    tax_year: String(row.tax_year),
    region: String(row.region),
    personal_allowance: Number(row.personal_allowance),
    bands: JSON.parse(String(row.bands)) as TaxConfig['bands'],
    ni_thresholds: JSON.parse(String(row.ni_thresholds)) as TaxConfig['ni_thresholds'],
    ni_rates: JSON.parse(String(row.ni_rates)) as TaxConfig['ni_rates'],
  };
}

export async function putTaxConfig(db: D1Database, cfg: TaxConfig): Promise<TaxConfig> {
  await db
    .prepare(
      `INSERT INTO tax_config (tax_year, region, personal_allowance, bands, ni_thresholds, ni_rates)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(tax_year) DO UPDATE SET
         region = excluded.region,
         personal_allowance = excluded.personal_allowance,
         bands = excluded.bands,
         ni_thresholds = excluded.ni_thresholds,
         ni_rates = excluded.ni_rates`,
    )
    .bind(
      cfg.tax_year,
      cfg.region,
      cfg.personal_allowance,
      JSON.stringify(cfg.bands),
      JSON.stringify(cfg.ni_thresholds),
      JSON.stringify(cfg.ni_rates),
    )
    .run();
  const saved = await getTaxConfig(db, cfg.tax_year);
  return saved as TaxConfig;
}

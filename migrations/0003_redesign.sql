-- v2 redesign: savings becomes a toggled outgoing; targets become a slim overlay;
-- months become absolute 'YYYY-MM'; a global savings rate lives in settings.
-- Additive + data-preserving: existing rows are migrated, nothing is dropped.

-- Global default savings interest rate (%).
ALTER TABLE settings ADD COLUMN default_savings_rate REAL NOT NULL DEFAULT 0;

-- Outgoings gain savings semantics + opt-in variable tracking.
ALTER TABLE bills ADD COLUMN is_savings INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN balance REAL NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN track_actuals INTEGER NOT NULL DEFAULT 0;

-- Absolute-month columns.
ALTER TABLE events ADD COLUMN start_ym TEXT;
ALTER TABLE income_oneoff ADD COLUMN month_ym TEXT;

-- Slim savings-target overlay.
CREATE TABLE IF NOT EXISTS targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  target_amount REAL NOT NULL DEFAULT 0,
  target_ym TEXT NOT NULL DEFAULT '',
  linked_bill_id INTEGER
);

-- Backfill absolute months from the old integer offsets (relative to now).
UPDATE events
  SET start_ym = strftime('%Y-%m', date('now', 'start of month', '+' || (start_month - 1) || ' months'))
  WHERE start_ym IS NULL;
UPDATE income_oneoff
  SET month_ym = strftime('%Y-%m', date('now', 'start of month', '+' || (month - 1) || ' months'))
  WHERE month_ym IS NULL;

-- Migrate existing savings_targets into savings-line bills (preserving balances
-- and monthly contributions), and into the new targets table where a goal was set.
INSERT INTO bills (name, category, amount, frequency, active, is_savings, balance, track_actuals)
  SELECT name, 'Savings', monthly_contribution, 'Monthly', 1, 1, balance, 0 FROM savings_targets;

INSERT INTO targets (name, target_amount, target_ym, linked_bill_id)
  SELECT st.name,
         st.target_amount,
         strftime('%Y-%m', date('now', 'start of month', '+' || (COALESCE(st.target_month, 12) - 1) || ' months')),
         (SELECT b.id FROM bills b WHERE b.is_savings = 1 AND b.name = st.name ORDER BY b.id DESC LIMIT 1)
  FROM savings_targets st
  WHERE st.target_amount IS NOT NULL;

-- Retire the old integer-offset columns now that absolute months are backfilled.
-- (Their NOT NULL constraints would otherwise block the new writeState.)
ALTER TABLE events DROP COLUMN start_month;
ALTER TABLE income_oneoff DROP COLUMN month;

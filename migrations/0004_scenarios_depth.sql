-- Depth round: per-pot interest override + scenarios become full plan copies.

-- Optional per-savings-line annual interest rate (% ) overriding the global default.
ALTER TABLE bills ADD COLUMN rate_override REAL;

-- Scenarios now store a full JSON copy of the editable plan.
ALTER TABLE scenarios ADD COLUMN payload TEXT;

-- The old override-based scenarios (and their override rows) can't be
-- reconstructed as full copies, so start clean. Scenarios are re-creatable
-- snapshots, so nothing of lasting value is lost.
DELETE FROM scenario_overrides;
DELETE FROM scenarios;

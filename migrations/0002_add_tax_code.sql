-- Add an optional PAYE tax code to income lines (e.g. 1257L, BR, K475, NT).
-- When set on a gross income, the pay calculator uses it to determine the
-- tax-free allowance / treatment instead of the default allowance + taper.
ALTER TABLE income ADD COLUMN tax_code TEXT;

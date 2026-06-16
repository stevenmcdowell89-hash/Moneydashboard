// Public engine surface. UI and tests import from here.
// Pure TypeScript — no I/O, no React. Implements the EngineApi contract.

export { normalizeFrequency, FACTOR } from './frequency';
export { netFromGross } from './paycalc';
export { monthlyNetIncome, totalMonthlyIncome, netBonus } from './income';
export { resolveScenario } from './scenario';
export { project } from './projection';
export { requiredContribution, monthGoalHit } from './target';

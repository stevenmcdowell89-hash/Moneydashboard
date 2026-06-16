import type { Income, IncomeOneoff, TaxConfig } from '../types';
import { normalizeFrequency } from './frequency';
import { netFromGross } from './paycalc';

/** Monthly NET value of a recurring income line. */
export function monthlyNetIncome(income: Income, taxConfig: TaxConfig | null): number {
  if (!income.active) return 0;
  if (income.entry_mode === 'gross') {
    if (!taxConfig || !income.gross_annual) return 0;
    const b = netFromGross(
      income.gross_annual,
      income.pension_rate ?? 0,
      income.pension_type ?? 'relief_at_source',
      income.sacrifice_monthly ?? 0,
      taxConfig,
      income.tax_code,
    );
    return b.netMonthly;
  }
  return normalizeFrequency(income.net_amount ?? 0, income.frequency);
}

/** Total recurring monthly net income across all lines. */
export const totalMonthlyIncome = (incomes: Income[], taxConfig: TaxConfig | null): number =>
  incomes.reduce((sum, i) => sum + monthlyNetIncome(i, taxConfig), 0);

/** Total annual gross of gross-entry incomes (used to stack bonuses marginally). */
const totalBaseGross = (incomes: Income[]): number =>
  incomes.reduce((s, i) => s + (i.active && i.entry_mode === 'gross' ? i.gross_annual ?? 0 : 0), 0);

/**
 * Net value of a one-off bonus, attributed to its month.
 * Annualise the year INCLUDING the bonus and take the marginal net:
 *   net(baseGross + bonusAfterSacrifice) - net(baseGross).
 * If there is no gross-entry base income, fall back to taxing the bonus alone.
 */
export function netBonus(oneoff: IncomeOneoff, incomes: Income[], taxConfig: TaxConfig | null): number {
  if (!taxConfig) return oneoff.gross_amount;
  const sacrifice = Math.max(0, oneoff.pension_sacrifice_pct ?? 0) / 100;
  const bonusGross = oneoff.gross_amount * (1 - sacrifice);
  const base = totalBaseGross(incomes);
  const withBonus = netFromGross(base + bonusGross, 0, 'relief_at_source', 0, taxConfig).netAnnual;
  const without = netFromGross(base, 0, 'relief_at_source', 0, taxConfig).netAnnual;
  // Marginal net of the bonus (relative to base). When base is 0 this taxes the bonus standalone.
  return Math.max(0, withBonus - without);
}

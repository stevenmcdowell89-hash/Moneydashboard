import type { PayBreakdown, PensionType, TaxConfig } from '../types';

// Banded income tax over taxable income (already net of allowances).
function bandedTax(taxable: number, bands: TaxConfig['bands']): number {
  if (taxable <= 0) return 0;
  // bands are sorted ascending by threshold (taxable income where the rate starts).
  const sorted = [...bands].sort((a, b) => a.threshold - b.threshold);
  let tax = 0;
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i].threshold;
    if (taxable <= start) break;
    const end = i + 1 < sorted.length ? sorted[i + 1].threshold : Infinity;
    const slice = Math.min(taxable, end) - start;
    if (slice > 0) tax += slice * sorted[i].rate;
  }
  return tax;
}

// Personal allowance taper: reduce £1 for every £2 of adjusted net income over the taper start.
function taperedAllowance(adjustedNetIncome: number, pa: number, taperStart: number): number {
  if (adjustedNetIncome <= taperStart) return pa;
  const reduction = Math.floor((adjustedNetIncome - taperStart) / 2);
  return Math.max(0, pa - reduction);
}

function employeeNI(niablePay: number, cfg: TaxConfig): number {
  const { primary, upper } = cfg.ni_thresholds;
  const { main, upper: upperRate } = cfg.ni_rates;
  if (niablePay <= primary) return 0;
  const mainBand = Math.max(0, Math.min(niablePay, upper) - primary);
  const upperBand = Math.max(0, niablePay - upper);
  return mainBand * main + upperBand * upperRate;
}

/**
 * Estimate annual gross -> monthly net for a single income.
 *
 *  - salary-sacrifice items (`sacrificeMonthly`) and a salary_sacrifice pension
 *    come off BEFORE tax AND NI (they reduce gross pay entirely).
 *  - net_pay pension reduces taxable income but NOT NI-able pay.
 *  - relief_at_source pension comes out of net take-home; the pot is topped up
 *    with basic-rate relief (reported separately, not added to take-home).
 *  - income tax is banded over (gross - allowances - pre-tax pension), with the
 *    personal-allowance taper above the configured taper start (default £100k).
 *
 * NOTE (surface in UI): this is an annualised ESTIMATE, not exact cumulative PAYE.
 */
export function netFromGross(
  grossAnnual: number,
  pensionRate: number, // percent
  pensionType: PensionType,
  sacrificeMonthly: number,
  taxConfig: TaxConfig,
): PayBreakdown {
  const gross = Math.max(0, grossAnnual || 0);
  const rate = Math.max(0, pensionRate || 0) / 100;
  const sacrificeAnnual = Math.max(0, sacrificeMonthly || 0) * 12;
  const taperStart = taxConfig.ni_thresholds.taper_start ?? 100000;

  // Pension contribution (employee side) based on selected scheme.
  const pensionContribution = gross * rate;

  // Pay after salary sacrifice (sacrifice items + salary_sacrifice pension).
  let payForTaxNi = gross - sacrificeAnnual;
  let preTaxPension = 0; // reduces taxable income
  let reliefAtSourceTopUp = 0;
  let takeHomePensionDeduction = sacrificeAnnual; // amounts already removed from cash

  if (pensionType === 'salary_sacrifice') {
    payForTaxNi -= pensionContribution;
    takeHomePensionDeduction += pensionContribution;
  } else if (pensionType === 'net_pay') {
    // Reduces taxable income but not NI-able pay; comes from gross.
    preTaxPension = pensionContribution;
    takeHomePensionDeduction += pensionContribution;
  } else {
    // relief_at_source: paid from net take-home; basic-rate relief added to pot.
    takeHomePensionDeduction += pensionContribution;
    reliefAtSourceTopUp = pensionContribution * 0.25; // 20% relief grossed onto net contribution
  }

  payForTaxNi = Math.max(0, payForTaxNi);

  // Adjusted net income for taper uses income net of pre-tax pension & sacrifice.
  const adjustedNetIncome = Math.max(0, payForTaxNi - preTaxPension);
  const personalAllowance = taperedAllowance(adjustedNetIncome, taxConfig.personal_allowance, taperStart);

  const taxableIncome = Math.max(0, payForTaxNi - preTaxPension - personalAllowance);
  const incomeTax = bandedTax(taxableIncome, taxConfig.bands);
  const nationalInsurance = employeeNI(payForTaxNi, taxConfig);

  const pensionAnnual = takeHomePensionDeduction;
  const netAnnual = gross - incomeTax - nationalInsurance - pensionAnnual;

  return {
    grossAnnual: gross,
    pensionAnnual,
    taxableIncome,
    incomeTax,
    nationalInsurance,
    personalAllowance,
    netAnnual,
    netMonthly: netAnnual / 12,
    reliefAtSourceTopUp,
  };
}

import type { Frequency } from '../types';

// Convert any frequency to a per-month-equivalent multiplier.
export const FACTOR: Record<Frequency, number> = {
  Monthly: 1,
  Quarterly: 1 / 3,
  Annual: 1 / 12,
  Weekly: 52 / 12,
  '4-weekly': 13 / 12,
};

/** Normalise an amount at a given frequency to its monthly-equivalent value. */
export const normalizeFrequency = (amount: number, f: Frequency): number =>
  (Number.isFinite(amount) ? amount : 0) * FACTOR[f];

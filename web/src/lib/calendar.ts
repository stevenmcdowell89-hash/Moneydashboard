// Real-calendar helpers. The app stores absolute months as 'YYYY-MM' strings and
// the engine projects by integer offset from the current month (offset 1 = this
// month). These helpers convert between the two and format for display, so the
// UI never shows a meaningless "month 7" — always "Mar 2027".

export type YM = string; // 'YYYY-MM'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Current month as 'YYYY-MM'. */
export function currentYM(now: Date = new Date()): YM {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function parseYM(s: YM): { y: number; m: number } {
  const [y, m] = s.split('-').map(Number);
  return { y, m };
}

export function makeYM(y: number, m: number): YM {
  // normalise overflow/underflow of month
  const total = y * 12 + (m - 1);
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Add n whole months to a YM. */
export function addMonths(s: YM, n: number): YM {
  const { y, m } = parseYM(s);
  return makeYM(y, m + n);
}

/** Offset of a target month relative to `now` (current month = 1). */
export function ymToOffset(target: YM, now: YM = currentYM()): number {
  const a = parseYM(now);
  const b = parseYM(target);
  return (b.y - a.y) * 12 + (b.m - a.m) + 1;
}

/** YM at a given projection offset (offset 1 = current month). */
export function offsetToYM(offset: number, now: YM = currentYM()): YM {
  return addMonths(now, offset - 1);
}

/** "Mar 2027" */
export function formatYM(s: YM): string {
  const { y, m } = parseYM(s);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

/** "Mar 27" — compact for chart axes / chips. */
export function formatYMShort(s: YM): string {
  const { y, m } = parseYM(s);
  return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`;
}

export { MONTHS_SHORT, MONTHS_LONG };

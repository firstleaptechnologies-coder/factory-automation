import { monthBounds, shiftMonth, thisMonth } from '@decor/shared';

/**
 * The windows a shop actually asks about.
 *
 * Offered instead of two date fields, because nobody standing at a machine
 * wants to type 2026-04-01 twice — and because the GST quarter is the reason
 * most of these get run at all, so it should be one tap rather than arithmetic
 * done in somebody's head.
 *
 * The financial year runs April to March, which is the only year an Indian
 * shop's books have.
 */
export interface PeriodChoice {
  key: string;
  label: string;
}

export const PERIODS: readonly PeriodChoice[] = [
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'thisQuarter', label: 'This quarter' },
  { key: 'lastQuarter', label: 'Last quarter' },
  { key: 'thisYear', label: 'This financial year' },
] as const;

/** Both ends of a window, as the days the API expects. */
export function periodDates(key: string, today = new Date()): { from: string; to: string } {
  const month = thisMonth(today);

  if (key === 'lastMonth') return boundsOf(shiftMonth(month, -1));
  if (key === 'thisMonth') return boundsOf(month);

  const monthIndex = today.getMonth();

  if (key === 'thisQuarter' || key === 'lastQuarter') {
    // Quarters counted from April, not January: an Indian return's first
    // quarter is April to June, and counting from January would file the wrong
    // three months under the right name.
    const sinceApril = (monthIndex - 3 + 12) % 12;
    const quarter = Math.floor(sinceApril / 3);
    const offset = key === 'lastQuarter' ? -3 : 0;
    const startsAt = shiftMonth(financialYearStart(today), quarter * 3 + offset);
    return { from: boundsOf(startsAt).from, to: boundsOf(shiftMonth(startsAt, 2)).to };
  }

  // The financial year: April of this one if we are past April, otherwise the
  // April before.
  const start = financialYearStart(today);
  return { from: boundsOf(start).from, to: boundsOf(shiftMonth(start, 11)).to };
}

function financialYearStart(today: Date): string {
  const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return `${year}-04`;
}

function boundsOf(month: string): { from: string; to: string } {
  const bounds = monthBounds(month);
  return { from: bounds.from, to: bounds.to };
}

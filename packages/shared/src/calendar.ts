/**
 * Calendar days, in the day the person is having.
 *
 * `toISOString().slice(0, 10)` is the obvious way to get "today" and it is
 * wrong for this product: it answers in UTC, so a shop in India opening the
 * register before half past five in the morning would be shown yesterday, and
 * an expense recorded late at night would be dated the day before. Every date
 * a person picks or is shown is a local calendar day; the ones the ledger
 * keeps are separate and stay UTC.
 */

/** Today, where the person is. */
export function today(now = new Date()): string {
  return isoDate(now);
}

/** This month, where the person is: YYYY-MM. */
export function thisMonth(now = new Date()): string {
  return today(now).slice(0, 7);
}

/** A Date as its local calendar day. */
export function isoDate(at: Date): string {
  const year = at.getFullYear();
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * The day a number of days either side of this one.
 *
 * Done on the calendar rather than by adding milliseconds, so it steps over a
 * month end and a daylight change without arithmetic anybody has to check.
 */
export function shiftDay(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return isoDate(new Date(year, month - 1, day + days));
}

/** The month a number of months either side of this one: YYYY-MM. */
export function shiftMonth(month: string, months: number): string {
  const [year, index] = month.split('-').map(Number);
  const at = new Date(year, index - 1 + months, 1);
  return isoDate(at).slice(0, 7);
}

/** The first and last calendar day of a month given as YYYY-MM. */
export function monthBounds(month: string): { from: string; to: string } {
  const [year, index] = month.split('-').map(Number);
  return {
    from: isoDate(new Date(year, index - 1, 1)),
    to: isoDate(new Date(year, index, 0)),
  };
}

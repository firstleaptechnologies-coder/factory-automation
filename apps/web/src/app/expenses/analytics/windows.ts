import { isoDate } from '@fas/shared';

/** The windows worth asking for, without making anybody type a date. */
export const WINDOWS = [
  { key: 'all', label: 'All time' },
  { key: 'year', label: 'This year' },
  { key: 'month', label: 'This month' },
] as const;

export type Window = (typeof WINDOWS)[number]['key'];

/**
 * The first day of the window, or nothing at all for all time.
 *
 * A sibling module rather than an export from `page.tsx`: the App Router only
 * permits its own known exports from a page, and a named one there fails the
 * typecheck as soon as Next has generated its route types.
 */
export function windowStart(key: Window, now = new Date()): string | undefined {
  if (key === 'all') return undefined;
  // Local, like every date a person picks: a shop is asking about its own
  // year, not about UTC's.
  return isoDate(new Date(now.getFullYear(), key === 'month' ? now.getMonth() : 0, 1));
}

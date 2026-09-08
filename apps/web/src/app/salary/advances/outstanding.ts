import type { SalaryAdvance } from '@decor/shared';

/**
 * What is still owed on one advance.
 *
 * A sibling module rather than an export from `page.tsx`: the App Router only
 * permits its own known exports from a page, and a named one there fails the
 * typecheck as soon as Next has generated its route types.
 */
export function outstanding(advance: SalaryAdvance): number {
  return Math.max(0, Number(advance.amount) - Number(advance.recoveredAmount));
}

import type { Report } from '@fas/shared';

/**
 * Whether a report is still going to change on its own.
 *
 * A sibling module rather than an export from `page.tsx`: the App Router only
 * permits its own known exports from a page, and a named one there fails the
 * typecheck as soon as Next has generated its route types.
 */
export function isWorking(status: Report['status']): boolean {
  return status === 'QUEUED' || status === 'GENERATING';
}

/** Ready is good, failed is bad, and the two waiting states are neither. */
export function statusColour(status: Report['status']): string {
  if (status === 'READY') return 'var(--success)';
  if (status === 'FAILED') return 'var(--danger)';
  if (status === 'EXPIRED') return 'var(--muted)';
  return 'var(--warning)';
}

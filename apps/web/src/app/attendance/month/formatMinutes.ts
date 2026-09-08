/**
 * Hours and minutes, because 90 minutes reads worse than 1h 30m.
 *
 * A sibling module rather than an export from `page.tsx`: the App Router only
 * permits its own known exports from a page, and a named one there fails the
 * typecheck as soon as Next has generated its route types.
 */
export function formatMinutes(minutes: number): string {
  if (!minutes) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ''}` : `${rest}m`;
}

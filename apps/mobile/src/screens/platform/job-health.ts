import type { JobHealth, JobState } from '@fas/shared';
import { palette } from '../../theme';

/**
 * How a job's state reads on screen.
 *
 * Mirrors the web module; the two clients are separate packages and mobile is
 * outside the npm workspaces.
 */
export function jobStateColour(state: JobState): string {
  if (state === 'ok') return palette.success;
  if (state === 'running') return palette.info;
  // `never` and `overdue` are the same problem wearing different hats: work
  // that is not happening. Both read as loudly as a failure, because a job
  // that stopped is the one nothing else in the product would mention.
  return state === 'failed' ? palette.danger : palette.warning;
}

export const JOB_STATE_LABELS: Record<JobState, string> = {
  ok: 'ok',
  running: 'running',
  failed: 'failed',
  overdue: 'overdue',
  never: 'never run',
};

/** One line for the top of the dashboard, or nothing when all is well. */
export function jobWarning(needing: JobHealth[]): string | null {
  if (!needing.length) return null;

  const names = needing.map((one) => one.job.label);
  const shown = names.slice(0, 2).join(' and ');
  const rest = names.length > 2 ? `, and ${names.length - 2} more` : '';
  return `${shown}${rest} ${names.length === 1 ? 'is not running' : 'are not running'}.`;
}

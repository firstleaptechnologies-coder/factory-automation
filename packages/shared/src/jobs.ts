/**
 * What runs on a clock, and whether it actually ran.
 *
 * Every scheduled job writes a `JobRun` row. Nothing reads them, which means
 * the one failure mode that matters here has always been invisible: a job that
 * *stops* running says nothing at all. A failure is loud — there is a row with
 * an error on it. A job that never fired leaves no row, and no row looks
 * exactly like a quiet night.
 *
 * So health is decided against an expected cadence rather than against the last
 * row's outcome. "Succeeded" and "has not run since Tuesday" are different
 * answers, and only one of them is fine.
 */

export type JobCadence = 'minutely' | 'daily';

export interface ScheduledJob {
  /** The dotted name the runner records, e.g. "ledger.reconcile". */
  name: string;
  label: string;
  blurb: string;
  cadence: JobCadence;
  /** Local time it is expected at, for a daily job. */
  at?: string;
}

/**
 * Every job on a clock.
 *
 * Kept beside the handlers rather than derived from them because the point is
 * to notice a job that is *missing* — and a list built from the handlers that
 * exist can never notice one that stopped existing. A rail in the API reads the
 * `@Cron` decorators against this list and fails when they disagree.
 */
export const SCHEDULED_JOBS: readonly ScheduledJob[] = [
  {
    name: 'reports.build',
    label: 'Build queued reports',
    blurb: 'Drains the report queue. Somebody is waiting at a screen for this.',
    cadence: 'minutely',
  },
  {
    /*
     * Daily rather than monthly: each workspace has its own billing day, so
     * there is no one day of the month when billing happens. A daily pass also
     * catches up anything missed while an instance was down.
     */
    name: 'billing.invoice',
    label: 'Write the month’s bills',
    blurb: 'Drafts an invoice for every workspace due one. Sending them is a decision.',
    cadence: 'daily',
    at: '03:45',
  },
  {
    name: 'jobs.prune',
    label: 'Prune job history',
    blurb: 'Trims old JobRun rows.',
    cadence: 'daily',
    at: '03:15',
  },
  {
    name: 'ledger.reconcile',
    label: 'Reconcile the ledger',
    blurb: 'Posts anything that moved money and never reached the ledger.',
    cadence: 'daily',
    at: '03:20',
  },
  {
    name: 'tenant.health',
    label: 'Workspace health',
    blurb: 'Last used, changes made, calls that failed, for every workspace.',
    cadence: 'daily',
    at: '03:30',
  },
  {
    name: 'logs.prune',
    label: 'Prune logs',
    blurb: 'Trims ServerLog and ClientLog.',
    cadence: 'daily',
    at: '03:45',
  },
  {
    name: 'reports.retention',
    label: 'Expire built reports',
    blurb: 'Drops the bytes of a report past its date, and keeps the row.',
    cadence: 'daily',
    at: '03:50',
  },
] as const;

/**
 * How long may pass before a job is late.
 *
 * Generous on purpose. A minutely job that missed one tick is not news; one
 * that has missed five is. A daily job gets a day and a bit, so a run that
 * drifts an hour late — or a clock that moved — does not cry wolf every
 * morning.
 */
const TOLERANCE_MS: Record<JobCadence, number> = {
  minutely: 5 * 60 * 1000,
  daily: 26 * 60 * 60 * 1000,
};

export type JobState = 'ok' | 'failed' | 'overdue' | 'never' | 'running';

export interface JobRunRecord {
  name: string;
  outcome: string;
  startedAt: string | Date;
  finishedAt?: string | Date | null;
  durationMs?: number | null;
  detail?: unknown;
  error?: string | null;
}

export interface JobHealth {
  job: ScheduledJob;
  state: JobState;
  lastRun: JobRunRecord | null;
  /** Milliseconds since it last started. Null when it has never run. */
  sinceMs: number | null;
  /** What to say about it, in one line. */
  summary: string;
}

/**
 * Whether a job is healthy, given its most recent run.
 *
 * The order matters. A job that has run recently and failed is `failed`; one
 * that has not run at all within its tolerance is `overdue` *whatever its last
 * outcome was* — a green run from three weeks ago is not good news, and
 * reporting it as `ok` is the exact blindness this replaces.
 */
export function jobHealth(
  job: ScheduledJob,
  lastRun: JobRunRecord | null,
  now: Date = new Date(),
): JobHealth {
  if (!lastRun) {
    return {
      job,
      state: 'never',
      lastRun: null,
      sinceMs: null,
      summary: 'Has never run.',
    };
  }

  const startedAt = new Date(lastRun.startedAt);
  const sinceMs = now.getTime() - startedAt.getTime();
  const late = sinceMs > TOLERANCE_MS[job.cadence];

  // A run still in flight is not late yet, however long it has been going —
  // that is a slow job, which is a different conversation from a missing one.
  if (lastRun.outcome === 'RUNNING' && !late) {
    return { job, state: 'running', lastRun, sinceMs, summary: 'Running now.' };
  }

  if (late) {
    return {
      job,
      state: 'overdue',
      lastRun,
      sinceMs,
      summary: `Last ran ${describeAge(sinceMs)}, and should have run since.`,
    };
  }

  if (lastRun.outcome === 'FAILED') {
    return {
      job,
      state: 'failed',
      lastRun,
      sinceMs,
      summary: lastRun.error ? `Failed — ${lastRun.error}` : 'Failed.',
    };
  }

  // SKIPPED means another instance held the lease, which is the lease working.
  return {
    job,
    state: 'ok',
    lastRun,
    sinceMs,
    summary:
      lastRun.outcome === 'SKIPPED'
        ? `Another instance ran it ${describeAge(sinceMs)}.`
        : `Ran ${describeAge(sinceMs)}.`,
  };
}

/** Health for every job, worst first — the list is read top-down. */
export function allJobHealth(
  runs: JobRunRecord[],
  now: Date = new Date(),
): JobHealth[] {
  const latest = new Map<string, JobRunRecord>();
  for (const run of runs) {
    const seen = latest.get(run.name);
    if (!seen || new Date(run.startedAt) > new Date(seen.startedAt)) latest.set(run.name, run);
  }

  const rank: Record<JobState, number> = {
    never: 0,
    overdue: 1,
    failed: 2,
    running: 3,
    ok: 4,
  };

  return SCHEDULED_JOBS.map((job) => jobHealth(job, latest.get(job.name) ?? null, now)).sort(
    (a, b) => rank[a.state] - rank[b.state],
  );
}

/** How many jobs need somebody to look at them. */
export function jobsNeedingAttention(health: JobHealth[]): JobHealth[] {
  return health.filter(
    (one) => one.state === 'overdue' || one.state === 'failed' || one.state === 'never',
  );
}

function describeAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

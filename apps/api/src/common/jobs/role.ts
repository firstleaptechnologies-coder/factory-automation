/**
 * What this process is here to do.
 *
 * One image, two jobs. An `api` process answers requests; a `worker` process
 * runs the clock. Today every instance does both, which stays *correct* —
 * `JobRunnerService` takes a lease, so only one of them actually runs a given
 * job — but it does not scale: adding a third API instance to cope with load
 * also adds a third scheduler waking at 03:20 to contend for the same lease,
 * and whichever one wins does the reconcile while it is meant to be serving.
 *
 * So the scheduler is armed by role rather than by everybody.
 *
 * The default is deliberately `both`. Nothing sets `ROLE` today — not local
 * development, not CI, not the seed scripts — and a default of `api` would
 * silently stop every nightly job everywhere with no error to notice. A
 * process is told to be a worker; it is never assumed not to be one.
 */
export type ProcessRole = 'api' | 'worker' | 'both';

const ROLES: ProcessRole[] = ['api', 'worker', 'both'];

/**
 * Read a role, refusing anything that is not one.
 *
 * A typo — `ROLE=workers`, `ROLE=Worker` — must not fall through to a default,
 * because the failure it causes is silence: no job ever runs and nothing says
 * so. Case and surrounding space are forgiven; a wrong word is not.
 */
export function roleOf(value: string | undefined | null): ProcessRole {
  const normalised = (value ?? '').trim().toLowerCase();
  if (!normalised) return 'both';

  const role = ROLES.find((candidate) => candidate === normalised);
  if (!role) {
    throw new Error(
      `ROLE must be one of ${ROLES.join(', ')} — got "${value}". ` +
        'Leave it unset for a single process that does both.',
    );
  }
  return role;
}

/** Whether this process arms the scheduler and owns the @Cron handlers. */
export const runsScheduledWork = (role: ProcessRole): boolean =>
  role === 'worker' || role === 'both';

/** The role this process was started as. */
export const currentRole = (): ProcessRole => roleOf(process.env.ROLE);

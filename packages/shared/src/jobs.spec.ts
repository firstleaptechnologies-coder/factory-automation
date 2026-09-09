import {
  JobRunRecord,
  SCHEDULED_JOBS,
  allJobHealth,
  jobHealth,
  jobsNeedingAttention,
} from './jobs';

const NOW = new Date('2026-09-09T10:00:00');
const nightly = SCHEDULED_JOBS.find((job) => job.name === 'ledger.reconcile')!;
const minutely = SCHEDULED_JOBS.find((job) => job.name === 'reports.build')!;

const run = (over: Partial<JobRunRecord> = {}): JobRunRecord => ({
  name: 'ledger.reconcile',
  outcome: 'OK',
  startedAt: '2026-09-09T03:20:00',
  ...over,
});

describe('the registry', () => {
  it('has no duplicate names', () => {
    const names = SCHEDULED_JOBS.map((job) => job.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every job a label, a blurb and a cadence', () => {
    for (const job of SCHEDULED_JOBS) {
      expect(job.label).toBeTruthy();
      expect(job.blurb).toBeTruthy();
      expect(['minutely', 'daily']).toContain(job.cadence);
    }
  });
});

describe('whether a job is healthy', () => {
  it('is fine when a nightly job ran this morning', () => {
    expect(jobHealth(nightly, run(), NOW).state).toBe('ok');
  });

  // The whole reason this exists: nothing else in the product would ever
  // mention a job that simply stopped.
  it('is overdue when a nightly job has not run since the day before last', () => {
    const health = jobHealth(nightly, run({ startedAt: '2026-09-07T03:20:00' }), NOW);

    expect(health.state).toBe('overdue');
    expect(health.summary).toMatch(/should have run since/);
  });

  // A green run from three weeks ago is not good news.
  it('is overdue even when the last run succeeded', () => {
    const health = jobHealth(nightly, run({ outcome: 'OK', startedAt: '2026-08-20T03:20:00' }), NOW);

    expect(health.state).toBe('overdue');
    expect(health.summary).toMatch(/20 days ago/);
  });

  it('is failed when the last run failed and was recent', () => {
    const health = jobHealth(
      nightly,
      run({ outcome: 'FAILED', error: 'could not take the lease' }),
      NOW,
    );

    expect(health.state).toBe('failed');
    expect(health.summary).toContain('could not take the lease');
  });

  it('has never run when there is no row at all', () => {
    const health = jobHealth(nightly, null, NOW);

    expect(health.state).toBe('never');
    expect(health.sinceMs).toBeNull();
  });

  // SKIPPED is the lease doing its job, not a missed run.
  it('treats a skipped run as healthy and says who ran it', () => {
    const health = jobHealth(nightly, run({ outcome: 'SKIPPED' }), NOW);

    expect(health.state).toBe('ok');
    expect(health.summary).toMatch(/Another instance/);
  });

  it('is running while a run is still in flight', () => {
    const health = jobHealth(
      minutely,
      run({ name: 'reports.build', outcome: 'RUNNING', startedAt: '2026-09-09T09:59:50' }),
      NOW,
    );

    expect(health.state).toBe('running');
  });

  // A slow job is a different conversation from a missing one, but a job that
  // has been "running" for hours is missing by any useful definition.
  it('is overdue when a run has been in flight far past its cadence', () => {
    const health = jobHealth(
      minutely,
      run({ name: 'reports.build', outcome: 'RUNNING', startedAt: '2026-09-09T08:00:00' }),
      NOW,
    );

    expect(health.state).toBe('overdue');
  });

  it('gives a minutely job a tighter tolerance than a nightly one', () => {
    const tenMinutesAgo = '2026-09-09T09:50:00';

    expect(jobHealth(minutely, run({ name: 'reports.build', startedAt: tenMinutesAgo }), NOW).state)
      .toBe('overdue');
    expect(jobHealth(nightly, run({ startedAt: tenMinutesAgo }), NOW).state).toBe('ok');
  });
});

describe('the whole board', () => {
  it('reports on every job, even ones with no runs', () => {
    expect(allJobHealth([], NOW)).toHaveLength(SCHEDULED_JOBS.length);
  });

  it('uses the most recent run when a job has several', () => {
    const health = allJobHealth(
      [
        run({ outcome: 'FAILED', startedAt: '2026-09-08T03:20:00' }),
        run({ outcome: 'OK', startedAt: '2026-09-09T03:20:00' }),
      ],
      NOW,
    ).find((one) => one.job.name === 'ledger.reconcile')!;

    expect(health.state).toBe('ok');
  });

  // The list is read top-down, so what is broken has to be at the top.
  it('puts what needs attention first', () => {
    const health = allJobHealth([run({ outcome: 'OK' })], NOW);

    expect(health[0].state).not.toBe('ok');
    expect(health.at(-1)?.job.name).toBe('ledger.reconcile');
  });

  it('counts only the jobs somebody has to do something about', () => {
    const health = allJobHealth([run({ outcome: 'OK' })], NOW);
    const attention = jobsNeedingAttention(health);

    // Every job but the reconcile has never run in this fixture.
    expect(attention).toHaveLength(SCHEDULED_JOBS.length - 1);
    expect(attention.every((one) => one.state !== 'ok')).toBe(true);
  });
});

import { JobRetentionJob, KEEP_DAYS } from './job-retention.job';
import { prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build() {
  const db = prismaMock() as never as Db;
  db.jobRun.deleteMany = jest.fn(async () => ({ count: 12 }));
  const runner = { run: jest.fn(async (_name: string, work: () => Promise<unknown>) => work()) };
  return { job: new JobRetentionJob(runner as never, db as never), db, runner };
}

describe('prune', () => {
  it('keeps three months of job history', async () => {
    const { job, db } = build();
    const now = new Date('2026-09-08T03:15:00.000Z');

    const detail = await job.prune(now);

    const cutoff = db.jobRun.deleteMany.mock.calls[0][0].where.startedAt.lt as Date;
    expect((now.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000)).toBe(KEEP_DAYS);
    expect(detail).toEqual({ removed: 12, before: cutoff.toISOString() });
  });

  it('runs through the runner, so it takes a lease like everything else', async () => {
    const { job, runner } = build();
    await job.nightly();
    expect(runner.run.mock.calls[0][0]).toBe('jobs.prune');
  });
});

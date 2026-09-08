import { KEEP_DAYS, LogRetentionJob } from './log-retention.job';
import { prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build() {
  const db = prismaMock() as never as Db;
  db.serverLog.deleteMany = jest.fn(async () => ({ count: 400 }));
  db.clientLog.deleteMany = jest.fn(async () => ({ count: 12 }));
  const runner = { run: jest.fn(async (_n: string, work: () => Promise<unknown>) => work()) };
  return { job: new LogRetentionJob(runner as never, db as never), db, runner };
}

describe('pruning the operational logs', () => {
  it('keeps a month of them', async () => {
    const { job, db } = build();
    const now = new Date('2026-09-08T03:45:00.000Z');

    const detail = await job.prune(now);

    const cutoff = db.serverLog.deleteMany.mock.calls[0][0].where.at.lt as Date;
    expect((now.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000)).toBe(KEEP_DAYS);
    expect(detail).toMatchObject({ server: 400, client: 12 });
  });

  it('prunes client logs by when they arrived, not when they happened', async () => {
    const { job, db } = build();
    // A device that was offline for six weeks should not have what it sends
    // deleted the moment it arrives.
    await job.prune(new Date('2026-09-08T03:45:00.000Z'));
    expect(db.clientLog.deleteMany.mock.calls[0][0].where).toHaveProperty('receivedAt');
  });

  it('runs through the runner, so it takes a lease like everything else', async () => {
    const { job, runner } = build();
    await job.nightly();
    expect(runner.run.mock.calls[0][0]).toBe('logs.prune');
  });
});

import { JobRunnerService } from './job-runner.service';
import { prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build(held = true) {
  const db = prismaMock() as never as Db;
  db.jobRun.create = jest.fn(async () => ({ id: 'run1' }));
  const leases = {
    acquire: jest.fn(async () => held),
    release: jest.fn(async () => undefined),
    holder: 'host:1:abcd',
  };
  return { runner: new JobRunnerService(db as never, leases as never), db, leases };
}

/** The row the run ended on. */
const finished = (db: Db) => db.jobRun.update.mock.calls[0][0].data;

describe('run', () => {
  it('records what the job found', async () => {
    const { runner, db } = build();
    await runner.run('tenant.health', async () => ({ tenants: 3, unreachable: [] }));

    expect(finished(db).outcome).toBe('OK');
    expect(finished(db).detail).toEqual({ tenants: 3, unreachable: [] });
    expect(finished(db).durationMs).toEqual(expect.any(Number));
  });

  it('does not run at all when another process holds the lease', async () => {
    const { runner, db, leases } = build(false);
    const work = jest.fn(async () => undefined);

    await runner.run('jobs.prune', work);

    expect(work).not.toHaveBeenCalled();
    // Still recorded: "skipped because someone else ran it" and "never fired"
    // look identical otherwise, and only one of them is healthy.
    expect(db.jobRun.create.mock.calls[0][0].data.outcome).toBe('SKIPPED');
    expect(leases.release).not.toHaveBeenCalled();
  });

  it('records a failure instead of throwing it', async () => {
    const { runner, db } = build();

    await expect(
      runner.run('tenant.health', async () => {
        throw new Error('database is not accepting connections');
      }),
    ).resolves.toBeUndefined();

    expect(finished(db).outcome).toBe('FAILED');
    expect(finished(db).error).toBe('database is not accepting connections');
  });

  it('gives the lease back even when the job failed', async () => {
    const { runner, leases } = build();
    await runner.run('tenant.health', async () => {
      throw new Error('nope');
    });
    // Otherwise tomorrow's run waits out the ttl for no reason.
    expect(leases.release).toHaveBeenCalledWith('tenant.health');
  });

  it('refuses to run when the lease itself cannot be read', async () => {
    const { runner, leases } = build();
    leases.acquire = jest.fn(async () => {
      throw new Error('platform database unreachable');
    });
    const work = jest.fn(async () => undefined);

    await runner.run('jobs.prune', work);

    // Running without a lease is the one thing the lease exists to prevent.
    expect(work).not.toHaveBeenCalled();
  });

  it('still finishes when the opening row could not be written', async () => {
    const { runner, db } = build();
    db.jobRun.create = jest
      .fn()
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValue({ id: 'run2' });
    const work = jest.fn(async () => ({ removed: 4 }));

    await runner.run('jobs.prune', work);

    expect(work).toHaveBeenCalled();
    expect(db.jobRun.create.mock.calls[1][0].data.outcome).toBe('OK');
  });
});

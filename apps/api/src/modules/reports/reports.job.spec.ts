import { currentTenant } from '../../common/tenancy/tenant-context';
import { ReportsJob } from './reports.job';

type Mocked = Record<string, jest.Mock>;

const TENANTS = [
  { id: 't1', slug: 'decorbucket' },
  { id: 't2', slug: 'woodcraft' },
];

function make(overrides: { pending?: string[] } = {}) {
  const prisma = {
    platform: { tenant: { findMany: jest.fn().mockResolvedValue(TENANTS) } },
  };
  const registry = {
    byIdOrThrow: jest.fn(async (id: string) => ({
      tenantId: id,
      slug: TENANTS.find((t) => t.id === id)?.slug ?? id,
      isolation: 'SHARED',
      modules: [],
    })),
  };

  /** Which tenant each call actually ran inside. */
  const ranInside: (string | undefined)[] = [];

  const reports = {
    requeueAbandoned: jest.fn(async () => 0),
    pending: jest.fn(async () => {
      ranInside.push(currentTenant()?.tenantId);
      return overrides.pending ?? [];
    }),
    generateOne: jest.fn(async () => true),
    expire: jest.fn(async () => {
      ranInside.push(currentTenant()?.tenantId);
      return { expired: 1, filesRemoved: 1 };
    }),
  };

  const runner = { run: jest.fn(async (_name: string, work: () => Promise<unknown>) => work()) };

  const job = new ReportsJob(
    runner as never,
    prisma as never,
    registry as never,
    reports as never,
  );

  return { job, prisma, reports, runner, ranInside };
}

describe('draining the queue', () => {
  // The bug this exists for: a Report is tenant-scoped, so reading the queue
  // from a cron with no tenant in context throws. Every tick failed with
  // "No tenant in context" until the job walked the tenants itself.
  it('does its work inside each tenant, not outside all of them', async () => {
    const { job, ranInside } = make();

    await job.drainQueue();

    expect(ranInside).toEqual(['t1', 't2']);
  });

  // The ledger reconcile shipped reading tenants[0] and reported nothing for
  // months, because the first row was the wrong workspace.
  it('visits every tenant rather than the first one', async () => {
    const { job, reports } = make();

    await job.drainQueue();

    expect(reports.pending).toHaveBeenCalledTimes(TENANTS.length);
  });

  it('leaves out a suspended workspace', async () => {
    const { job, prisma } = make();

    await job.drainQueue();

    expect(prisma.platform.tenant.findMany.mock.calls[0][0].where).toEqual({
      status: { not: 'SUSPENDED' },
    });
  });

  // Anything a worker claimed and died holding goes back before new work is
  // picked up, or it sits at GENERATING and nobody is coming for it.
  it('requeues abandoned work before building anything', async () => {
    const { job, reports } = make();
    const order: string[] = [];
    reports.requeueAbandoned.mockImplementation(async () => {
      order.push('requeue');
      return 0;
    });
    reports.pending.mockImplementation(async () => {
      order.push('pending');
      return [];
    });

    await job.drainQueue();

    expect(order.slice(0, 2)).toEqual(['requeue', 'pending']);
  });

  it('builds what it found and counts it', async () => {
    const { job, reports } = make({ pending: ['r1', 'r2'] });

    const detail = (await job.drainQueue()) as Record<string, unknown>;

    expect(reports.generateOne).toHaveBeenCalledTimes(4); // two per tenant
    expect(detail).toMatchObject({ built: 4, failed: 0 });
  });

  it('counts a build that failed rather than throwing the run away', async () => {
    const { job, reports } = make({ pending: ['r1'] });
    reports.generateOne.mockResolvedValue(false);

    const detail = (await job.drainQueue()) as Record<string, unknown>;

    expect(detail).toMatchObject({ built: 0, failed: 2 });
  });

  // A run that did nothing should not read like a run that never happened.
  it('says so when there was nothing queued', async () => {
    const { job } = make();

    const detail = (await job.drainQueue()) as Record<string, unknown>;

    expect(detail.summary).toBe('nothing queued');
  });

  it('goes through the runner, so it takes a lease and records a run', async () => {
    const { job, runner } = make();

    await job.build();

    expect(runner.run).toHaveBeenCalledWith('reports.build', expect.any(Function));
  });
});

describe('retention', () => {
  it('expires inside each tenant and totals what it did', async () => {
    const { job, ranInside } = make();

    const detail = (await job.expireEverywhere()) as Record<string, unknown>;

    expect(ranInside).toEqual(['t1', 't2']);
    expect(detail).toMatchObject({ expired: 2, filesRemoved: 2 });
  });

  it('goes through the runner too', async () => {
    const { job, runner } = make();

    await job.retention();

    expect(runner.run).toHaveBeenCalledWith('reports.retention', expect.any(Function));
  });
});

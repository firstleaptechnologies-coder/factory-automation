import { TenantIsolation } from '@prisma/client';
import { TenantHealthJob } from './tenant-health.job';
import { prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

const context = (over: Record<string, unknown> = {}) => ({
  tenantId: 't1',
  slug: 'decorbucket',
  isolation: TenantIsolation.SHARED,
  databaseUrl: null,
  ...over,
});

function build(options: {
  tenants?: { id: string; slug: string }[];
  contexts?: Record<string, unknown>;
  ping?: jest.Mock;
} = {}) {
  const tenants = options.tenants ?? [{ id: 't1', slug: 'decorbucket' }];
  const db = prismaMock() as never as Db;
  db.tenant.findMany = jest.fn(async () => tenants);

  const ping = options.ping ?? jest.fn(async () => [{ '?column?': 1 }]);
  // `scoped` is a getter on the real service; here it only has to hand back
  // something that answers SELECT 1.
  (db as unknown as Record<string, unknown>).scoped = { $queryRaw: ping };

  const registry = {
    byIdOrThrow: jest.fn(async (id: string) =>
      (options.contexts ?? {})[id] ?? context({ tenantId: id, slug: `shop-${id}` }),
    ),
  };
  const runner = { run: jest.fn(async (_name: string, work: () => Promise<unknown>) => work()) };

  return {
    job: new TenantHealthJob(runner as never, db as never, registry as never),
    db,
    ping,
    registry,
    runner,
  };
}

describe('check', () => {
  it('skips suspended workspaces', async () => {
    const { job, db } = build();
    await job.check();
    // Nobody can sign into a suspended workspace, so its database being down
    // is not something to wake anyone about.
    expect(db.tenant.findMany.mock.calls[0][0].where).toEqual({
      status: { not: 'SUSPENDED' },
    });
  });

  it('asks a shared database once, however many shops live in it', async () => {
    const { job, ping } = build({
      tenants: [
        { id: 't1', slug: 'decorbucket' },
        { id: 't2', slug: 'other' },
        { id: 't3', slug: 'third' },
      ],
    });

    const detail = (await job.check()) as Record<string, unknown>;

    expect(ping).toHaveBeenCalledTimes(1);
    expect(detail).toEqual({ tenants: 3, databases: 1, unreachable: [] });
  });

  it('asks each dedicated database separately', async () => {
    const { job, ping } = build({
      tenants: [
        { id: 't1', slug: 'decorbucket' },
        { id: 't2', slug: 'own-db' },
      ],
      contexts: {
        t2: context({
          tenantId: 't2',
          slug: 'own-db',
          isolation: TenantIsolation.DEDICATED,
          databaseUrl: 'postgresql://elsewhere/db',
        }),
      },
    });

    const detail = (await job.check()) as Record<string, unknown>;

    expect(ping).toHaveBeenCalledTimes(2);
    expect(detail).toMatchObject({ databases: 2 });
  });

  it('names the workspace whose database did not answer', async () => {
    const ping = jest.fn(async () => {
      throw new Error('connection refused');
    });
    const { job } = build({ tenants: [{ id: 't9', slug: 'gone' }], ping });

    const detail = (await job.check()) as Record<string, unknown>;

    // The point of the whole job: a name to ring, before they ring us.
    expect(detail.unreachable).toEqual(['gone']);
  });

  it('carries on after one workspace fails', async () => {
    const ping = jest
      .fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValue([{ ok: 1 }]);
    const { job } = build({
      tenants: [
        { id: 't1', slug: 'gone' },
        { id: 't2', slug: 'fine' },
      ],
      contexts: {
        t1: context({
          tenantId: 't1',
          slug: 'gone',
          isolation: TenantIsolation.DEDICATED,
          databaseUrl: 'postgresql://one/db',
        }),
        t2: context({
          tenantId: 't2',
          slug: 'fine',
          isolation: TenantIsolation.DEDICATED,
          databaseUrl: 'postgresql://two/db',
        }),
      },
      ping,
    });

    const detail = (await job.check()) as Record<string, unknown>;

    expect(detail).toEqual({ tenants: 2, databases: 2, unreachable: ['gone'] });
  });
});

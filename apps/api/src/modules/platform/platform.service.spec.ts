import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TenantIsolation, TenantStatus } from '@prisma/client';
import { PlatformService } from './platform.service';
import { prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

const disconnect = jest.fn(async () => undefined);
const constructed: { url: string }[] = [];

/**
 * A dedicated tenant is reached through a PrismaClient built on the spot, so
 * the constructor is faked to record the connection string it was handed.
 */
jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  return {
    ...actual,
    PrismaClient: class {
      private reachable: boolean;
      constructor(options: { datasources: { db: { url: string } } }) {
        const url = options.datasources.db.url;
        constructed.push({ url });
        // A URL saying "down" stands in for a database we cannot reach.
        this.reachable = !url.includes('down');
      }
      private count = async () => {
        if (!this.reachable) throw new Error('connect ECONNREFUSED');
        return 1;
      };
      user = { count: this.count };
      order = { count: this.count };
      client = { count: this.count };
      role = { findFirst: async () => null, update: async () => null };
      $disconnect = disconnect;
    },
  };
});

function build() {
  const db = prismaMock() as never as Db;
  (db as unknown as Record<string, unknown>).platform = db;
  const encryption = {
    encrypt: jest.fn((value: string) => `enc(${value})`),
    decryptToString: jest.fn((value: string) => value.replace(/^enc\(|\)$/g, '')),
  };
  const registry = { invalidate: jest.fn() };

  /*
   * What `detail` reads beyond the tenant row: the tier it is on, its activity
   * in our own logs, and its people from its own database. Defaulted to empty
   * so a test about redaction is about redaction.
   */
  db.subscriptionTier = { findUnique: jest.fn(async () => null) };
  // Added to what prismaMock already provides, not over it: `list` reads the
  // same logs through groupBy, and replacing the table wholesale takes that
  // away from a test that has nothing to do with this.
  db.serverLog.count = jest.fn(async () => 0);
  db.serverLog.findFirst = jest.fn(async () => null);
  db.clientLog.count = jest.fn(async () => 0);
  db.role.findMany = jest.fn(async () => []);
  db.user.findMany = jest.fn(async () => []);
  const provisioning = {
    seed: jest.fn(async (..._args: unknown[]) => undefined),
    syncSystemRoles: jest.fn(async (..._args: unknown[]) => 0),
  };
  return {
    service: new PlatformService(
      db as never,
      encryption as never,
      registry as never,
      provisioning as never,
    ),
    db,
    encryption,
    registry,
    provisioning,
  };
}

beforeEach(() => {
  constructed.length = 0;
  jest.clearAllMocks();
});

const CREATE = {
  slug: 'DecorBucket',
  name: 'Decor Bucket',
  ownerName: 'Nakul',
  ownerCode: 'nakul',
  ownerPassword: 'admin123',
};

describe('onModuleInit', () => {
  it('reconciles roles for every workspace that is not suspended', async () => {
    const { service, db, provisioning } = build();
    db.tenant.findMany = jest.fn(async () => [
      { id: 't1', slug: 'a', databaseUrl: null },
      { id: 't2', slug: 'b', databaseUrl: null },
    ]);
    await service.onModuleInit();
    // A trial workspace is in daily use and must not be left behind a release.
    expect(db.tenant.findMany.mock.calls[0][0].where).toEqual({
      status: { not: TenantStatus.SUSPENDED },
    });
    expect(provisioning.syncSystemRoles).toHaveBeenCalledTimes(2);
  });

  it('opens the dedicated database for a dedicated workspace and closes it after', async () => {
    const { service, db } = build();
    db.tenant.findMany = jest.fn(async () => [
      { id: 't1', slug: 'a', databaseUrl: 'enc(postgres://dedicated)' },
    ]);
    await service.onModuleInit();
    expect(constructed[0].url).toBe('postgres://dedicated');
    expect(disconnect).toHaveBeenCalled();
  });

  it('keeps booting when one dedicated database is unreachable', async () => {
    const { service, db, provisioning } = build();
    db.tenant.findMany = jest.fn(async () => [
      { id: 't1', slug: 'broken', databaseUrl: 'enc(postgres://down)' },
      { id: 't2', slug: 'fine', databaseUrl: null },
    ]);
    provisioning.syncSystemRoles = jest
      .fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockResolvedValueOnce(0);
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(provisioning.syncSystemRoles).toHaveBeenCalledTimes(2);
  });

  it('does not stop the API starting when the platform table itself is unreachable', async () => {
    const { service, db } = build();
    db.tenant.findMany = jest.fn(async () => {
      throw new Error('no database');
    });
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});

describe('create', () => {
  it('refuses a slug that is taken', async () => {
    const { service, db } = build();
    db.tenant.findUnique = jest.fn(async () => ({ id: 't1' }));
    await expect(service.create(CREATE as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('lower-cases the slug, since it is what people type to sign in', async () => {
    const { service, db } = build();
    db.tenant.create = jest.fn(async () => ({ id: 't1', slug: 'decorbucket', databaseUrl: null }));
    await service.create(CREATE as never);
    expect(db.tenant.create.mock.calls[0][0].data.slug).toBe('decorbucket');
    expect(db.tenant.findUnique.mock.calls[0][0].where).toEqual({ slug: 'decorbucket' });
  });

  it('starts a new workspace on trial', async () => {
    const { service, db } = build();
    db.tenant.create = jest.fn(async () => ({ id: 't1', slug: 'decorbucket', databaseUrl: null }));
    await service.create(CREATE as never);
    expect(db.tenant.create.mock.calls[0][0].data.status).toBe(TenantStatus.TRIAL);
  });

  it('refuses a dedicated workspace with no connection string', async () => {
    const { service } = build();
    await expect(
      service.create({ ...CREATE, isolation: TenantIsolation.DEDICATED } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('encrypts the connection string before storing it', async () => {
    const { service, db, encryption } = build();
    db.tenant.create = jest.fn(async () => ({ id: 't1', slug: 's', databaseUrl: 'enc(x)' }));
    await service.create({
      ...CREATE,
      isolation: TenantIsolation.DEDICATED,
      databaseUrl: 'postgres://dedicated',
    } as never);
    expect(encryption.encrypt).toHaveBeenCalledWith('postgres://dedicated');
    expect(db.tenant.create.mock.calls[0][0].data.databaseUrl).toBe('enc(postgres://dedicated)');
  });

  it('seeds the workspace so it opens ready to use', async () => {
    const { service, db, provisioning } = build();
    db.tenant.create = jest.fn(async () => ({ id: 't1', slug: 's', databaseUrl: null }));
    await service.create(CREATE as never);
    expect(provisioning.seed.mock.calls[0][1]).toBe('t1');
  });

  it('removes the workspace again if seeding fails', async () => {
    const { service, db, provisioning } = build();
    db.tenant.create = jest.fn(async () => ({ id: 't1', slug: 's', databaseUrl: null }));
    provisioning.seed = jest.fn(async () => {
      throw new Error('materials failed');
    });
    // Someone signing in to a shop with no statuses and no materials is worse
    // than the workspace not existing.
    await expect(service.create(CREATE as never)).rejects.toThrow(/materials failed/);
    expect(db.tenant.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
  });

  it('returns the sign-in details with the code upper-cased', async () => {
    const { service, db } = build();
    db.tenant.create = jest.fn(async () => ({ id: 't1', slug: 'decorbucket', databaseUrl: null }));
    const result = await service.create(CREATE as never);
    expect(result.signIn).toEqual({ workspace: 'decorbucket', code: 'NAKUL' });
  });

  it('never returns the connection string', async () => {
    const { service, db } = build();
    db.tenant.create = jest.fn(async () => ({
      id: 't1',
      slug: 's',
      databaseUrl: 'enc(postgres://dedicated)',
    }));
    const result = (await service.create({
      ...CREATE,
      isolation: TenantIsolation.DEDICATED,
      databaseUrl: 'postgres://dedicated',
    } as never)) as Record<string, unknown>;
    expect(result).not.toHaveProperty('databaseUrl');
    expect(result.hasDedicatedDatabase).toBe(true);
  });
});

/*
 * `findOne` used to answer these and was removed once `detail` superseded it —
 * same redaction, same counts, and everything else the console needs in one
 * read. The assertions moved rather than going with it: a connection string
 * reaching the API is the same leak whichever method returns it.
 */
describe('reading tenants', () => {
  it('reports a missing workspace', async () => {
    const { service } = build();
    await expect(service.detail('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('redacts the connection string on every read', async () => {
    const { service, db } = build();
    db.tenant.findUnique = jest.fn(async () => ({
      id: 't1',
      slug: 's',
      databaseUrl: 'enc(postgres://x)',
    }));
    const result = (await service.detail('t1')) as Record<string, unknown>;
    expect(result).not.toHaveProperty('databaseUrl');
    expect(result.hasDedicatedDatabase).toBe(true);
  });

  it('says a workspace has no dedicated database when it does not', async () => {
    const { service, db } = build();
    db.tenant.findUnique = jest.fn(async () => ({ id: 't1', slug: 's', databaseUrl: null }));
    const result = (await service.detail('t1')) as Record<string, unknown>;
    expect(result.hasDedicatedDatabase).toBe(false);
  });

  it('counts a pooled workspace out of the shared database', async () => {
    const { service, db } = build();
    db.tenant.findUnique = jest.fn(async () => ({ id: 't1', slug: 's', databaseUrl: null }));
    db.user.count = jest.fn(async () => 4);
    db.order.count = jest.fn(async () => 9);
    db.client.count = jest.fn(async () => 6);
    const result = await service.detail('t1');
    expect(result.counts).toEqual({ users: 4, orders: 9, clients: 6 });
    expect(db.user.count.mock.calls[0][0].where).toEqual({ tenantId: 't1' });
  });

  it('marks an unreachable dedicated database rather than failing the list', async () => {
    const { service, db } = build();
    db.tenant.findMany = jest.fn(async () => [
      { id: 't1', slug: 'broken', databaseUrl: 'enc(postgres://down)' },
      { id: 't2', slug: 'fine', databaseUrl: null },
    ]);
    const list = await service.list();
    // One tenant's database being down must not take the whole list with it.
    expect(list[0].counts).toMatchObject({ unreachable: true, users: null });
    expect(list[1].counts).toEqual({ users: 0, orders: 0, clients: 0 });
  });

  it('closes the dedicated connection even when counting failed', async () => {
    const { service, db } = build();
    db.tenant.findMany = jest.fn(async () => [
      { id: 't1', slug: 'broken', databaseUrl: 'enc(postgres://down)' },
    ]);
    await service.list();
    expect(disconnect).toHaveBeenCalled();
  });
});

describe('update and isolation', () => {
  it('drops the workspace from the registry cache after an edit', async () => {
    const { service, db, registry } = build();
    db.tenant.update = jest.fn(async () => ({ id: 't1', slug: 's', databaseUrl: null }));
    await service.update('t1', { name: 'Renamed' } as never);
    // Otherwise a suspended workspace keeps working until the API restarts.
    expect(registry.invalidate).toHaveBeenCalled();
  });

  it('refuses to move to dedicated without a connection string', async () => {
    const { service } = build();
    await expect(
      service.changeIsolation('t1', { isolation: TenantIsolation.DEDICATED } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('clears the connection string when moving back to pooled', async () => {
    const { service, db } = build();
    db.tenant.update = jest.fn(async () => ({ id: 't1', slug: 's', databaseUrl: null }));
    await service.changeIsolation('t1', { isolation: TenantIsolation.SHARED } as never);
    expect(db.tenant.update.mock.calls[0][0].data.databaseUrl).toBeNull();
  });

  it('encrypts the new connection string when moving to dedicated', async () => {
    const { service, db, encryption } = build();
    db.tenant.update = jest.fn(async () => ({ id: 't1', slug: 's', databaseUrl: 'enc(x)' }));
    await service.changeIsolation('t1', {
      isolation: TenantIsolation.DEDICATED,
      databaseUrl: 'postgres://new',
    } as never);
    expect(encryption.encrypt).toHaveBeenCalledWith('postgres://new');
  });
});

/**
 * Is anybody using it, and is it working for them?
 *
 * The answer comes from the operational log in the platform database, so it
 * costs one read for every workspace and reaches into nobody's data.
 */
describe('how a workspace is doing', () => {
  function build() {
    const db = prismaMock() as never as Db;
    (db as unknown as Record<string, unknown>).platform = db;
    db.tenant.findMany = jest.fn(async () => [
      { id: 't1', slug: 'decorbucket', databaseUrl: null, plan: 'shop', modules: [] },
      { id: 't2', slug: 'quiet', databaseUrl: null, plan: 'shop', modules: [] },
    ]);
    db.serverLog.groupBy = jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      where.outcome === 'failed'
        ? [{ tenantId: 't1', _count: { _all: 2 } }]
        : [
            {
              tenantId: 't1',
              _count: { _all: 140 },
              _max: { at: new Date('2026-09-08T10:00:00.000Z') },
            },
          ],
    );
    db.clientLog.groupBy = jest.fn(async () => [{ tenantId: 't1', _count: { _all: 5 } }]);
    db.user.count = jest.fn(async () => 0);
    db.order.count = jest.fn(async () => 0);
    db.client.count = jest.fn(async () => 0);

    return {
      service: new PlatformService(
        db as never,
        { decryptToString: jest.fn() } as never,
        { invalidate: jest.fn() } as never,
        { seed: jest.fn(), syncSystemRoles: jest.fn() } as never,
      ),
      db,
    };
  }

  it('says when somebody last changed something', async () => {
    const [busy] = await build().service.list();
    expect(busy.health).toMatchObject({
      lastSeenAt: '2026-09-08T10:00:00.000Z',
      writes: 140,
      failures: 2,
      clientErrors: 5,
    });
  });

  it('says plainly that a quiet workspace is quiet', async () => {
    const [, quiet] = await build().service.list();
    // Not an error, and not a blank: nobody has touched it.
    expect(quiet.health).toEqual({
      lastSeenAt: null,
      writes: 0,
      failures: 0,
      clientErrors: 0,
    });
  });

  it('asks the log once for everybody, not once per workspace', async () => {
    const { service, db } = build();
    await service.list();
    // Three queries for any number of tenants: activity, failures, client
    // errors.
    expect(db.serverLog.groupBy).toHaveBeenCalledTimes(2);
    expect(db.clientLog.groupBy).toHaveBeenCalledTimes(1);
  });

  it('looks back a fortnight, which sees a quiet week', async () => {
    const { service, db } = build();
    await service.list();

    const since = db.serverLog.groupBy.mock.calls[0][0].where.at.gte as Date;
    const days = (Date.now() - since.getTime()) / (24 * 60 * 60 * 1000);
    expect(Math.round(days)).toBe(14);
  });

  it('reaches into no tenant’s database to work it out', async () => {
    const { service, db } = build();
    await service.list();
    // The counts do that; the health figures deliberately do not.
    expect(db.serverLog.groupBy.mock.calls[0][0].where).not.toHaveProperty('databaseUrl');
  });
});

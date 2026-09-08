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

describe('reading tenants', () => {
  it('reports a missing workspace', async () => {
    const { service } = build();
    await expect(service.findOne('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('redacts the connection string on every read', async () => {
    const { service, db } = build();
    db.tenant.findUnique = jest.fn(async () => ({
      id: 't1',
      slug: 's',
      databaseUrl: 'enc(postgres://x)',
    }));
    const result = (await service.findOne('t1')) as Record<string, unknown>;
    expect(result).not.toHaveProperty('databaseUrl');
    expect(result.hasDedicatedDatabase).toBe(true);
  });

  it('says a workspace has no dedicated database when it does not', async () => {
    const { service, db } = build();
    db.tenant.findUnique = jest.fn(async () => ({ id: 't1', slug: 's', databaseUrl: null }));
    const result = (await service.findOne('t1')) as Record<string, unknown>;
    expect(result.hasDedicatedDatabase).toBe(false);
  });

  it('counts a pooled workspace out of the shared database', async () => {
    const { service, db } = build();
    db.tenant.findUnique = jest.fn(async () => ({ id: 't1', slug: 's', databaseUrl: null }));
    db.user.count = jest.fn(async () => 4);
    db.order.count = jest.fn(async () => 9);
    db.client.count = jest.fn(async () => 6);
    const result = await service.findOne('t1');
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

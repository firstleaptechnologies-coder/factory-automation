import { NotFoundException } from '@nestjs/common';
import { TenantIsolation, TenantStatus } from '@prisma/client';
import { TenantRegistryService } from './tenant-registry.service';
import { prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

const tenant = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  slug: 'decorbucket',
  name: 'Decor Bucket',
  status: TenantStatus.ACTIVE,
  isolation: TenantIsolation.SHARED,
  databaseUrl: null,
  ...over,
});

function build(row: unknown = tenant(), tier: unknown = null) {
  const db = prismaMock() as never as Db;
  (db as unknown as Record<string, unknown>).platform = db;
  db.tenant.findUnique = jest.fn(async () => row);
  // What the tier includes today. Null means no such row, which falls back to
  // the seeded definition rather than to a workspace that can reach nothing.
  db.subscriptionTier = { findUnique: jest.fn(async () => tier) };
  const encryption = { decryptToString: jest.fn((value: string) => `decrypted:${value}`) };
  return {
    service: new TenantRegistryService(db as never, encryption as never),
    db,
    encryption,
  };
}

describe('bySlugOrThrow', () => {
  it('finds a workspace regardless of how the slug was typed', async () => {
    const { service, db } = build();
    await service.bySlugOrThrow('DecorBucket');
    expect(db.tenant.findUnique.mock.calls[0][0].where).toEqual({ slug: 'decorbucket' });
  });

  it('reports an unknown workspace by name', async () => {
    const { service } = build(null);
    await expect(service.bySlugOrThrow('nowhere')).rejects.toThrow(/No workspace found for/);
  });

  it('reads the platform database only once for repeated lookups', async () => {
    const { service, db } = build();
    await service.bySlugOrThrow('decorbucket');
    await service.bySlugOrThrow('decorbucket');
    // This runs in front of every other query on every request.
    expect(db.tenant.findUnique).toHaveBeenCalledTimes(1);
  });

  it('returns the context the Prisma proxy needs', async () => {
    const { service } = build();
    await expect(service.bySlugOrThrow('decorbucket')).resolves.toEqual({
      tenantId: 't1',
      slug: 'decorbucket',
      isolation: TenantIsolation.SHARED,
      databaseUrl: null,
      // Resolved here so a module check is a lookup in memory rather than a
      // query in front of every request.
      modules: ['orders', 'leads', 'quotes', 'finance', 'clients'],
    });
  });

  it('works out what the workspace has bought, from the plan and the extras', async () => {
    const { service } = build(tenant({ plan: 'punch', modules: ['hr'] }));
    const context = await service.bySlugOrThrow('decorbucket');

    // A shop that wants one thing from the next tier up should not have to buy
    // the tier.
    expect(context.modules).toEqual(['orders', 'clients', 'hr']);
  });

  /*
   * The tier is a row the owner edits, so it decides. Reading the compiled
   * list instead is how a screen comes to look like it controls the product
   * while changing nothing but the invoice.
   */
  it('takes what the tier includes from the tier, not from the compiled list', async () => {
    const { service } = build(tenant({ plan: 'punch', modules: [] }), {
      includedModules: ['leads', 'quotes'],
      isActive: true,
    });

    const context = await service.bySlugOrThrow('decorbucket');

    expect(context.modules).toEqual(['orders', 'leads', 'quotes', 'clients']);
  });

  // A tier deleted underneath a workspace must not leave them with nothing.
  it('falls back to the seeded plan when the tier has no row', async () => {
    const { service } = build(tenant({ plan: 'shop', modules: [] }), null);
    const context = await service.bySlugOrThrow('decorbucket');

    expect(context.modules).toContain('finance');
  });

  // And the core is in whatever the tier says: a workspace that cannot take an
  // order is not a product anybody sold.
  it('keeps the core modules even when the tier leaves them out', async () => {
    const { service } = build(tenant({ plan: 'punch', modules: [] }), {
      includedModules: [],
      isActive: true,
    });

    const context = await service.bySlugOrThrow('decorbucket');

    expect(context.modules).toContain('orders');
    expect(context.modules).toContain('clients');
  });
});

describe('byIdOrThrow', () => {
  it('reports an unknown id', async () => {
    const { service } = build(null);
    await expect(service.byIdOrThrow('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('shares the cache with the slug lookup', async () => {
    const { service, db } = build();
    await service.bySlugOrThrow('decorbucket');
    await service.byIdOrThrow('t1');
    expect(db.tenant.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('suspension', () => {
  it('refuses a suspended workspace and names it', async () => {
    const { service } = build(tenant({ status: TenantStatus.SUSPENDED }));
    await expect(service.bySlugOrThrow('decorbucket')).rejects.toThrow(
      /Decor Bucket is suspended/,
    );
  });

  it('does not cache a suspended workspace', async () => {
    const { service, db } = build(tenant({ status: TenantStatus.SUSPENDED }));
    await expect(service.bySlugOrThrow('decorbucket')).rejects.toThrow();
    await expect(service.bySlugOrThrow('decorbucket')).rejects.toThrow();
    expect(db.tenant.findUnique).toHaveBeenCalledTimes(2);
  });

  it('lets a trial workspace in', async () => {
    const { service } = build(tenant({ status: TenantStatus.TRIAL }));
    await expect(service.bySlugOrThrow('decorbucket')).resolves.toMatchObject({
      tenantId: 't1',
    });
  });
});

describe('dedicated databases', () => {
  it('decrypts the connection string before handing it on', async () => {
    const { service, encryption } = build(
      tenant({ isolation: TenantIsolation.DEDICATED, databaseUrl: 'cipher' }),
    );
    const context = await service.bySlugOrThrow('decorbucket');
    // Stored encrypted: it is the key to another business's entire database.
    expect(encryption.decryptToString).toHaveBeenCalledWith('cipher');
    expect(context.databaseUrl).toBe('decrypted:cipher');
  });

  it('does not try to decrypt a pooled tenant’s empty column', async () => {
    const { service, encryption } = build();
    await service.bySlugOrThrow('decorbucket');
    expect(encryption.decryptToString).not.toHaveBeenCalled();
  });
});

describe('invalidate', () => {
  it('makes the next lookup read the platform database again', async () => {
    const { service, db } = build();
    await service.bySlugOrThrow('decorbucket');
    service.invalidate({ id: 't1', slug: 'decorbucket' } as never);
    await service.bySlugOrThrow('decorbucket');
    // Without this a suspended workspace keeps working until the API restarts.
    expect(db.tenant.findUnique).toHaveBeenCalledTimes(2);
  });

  it('clears the id cache as well as the slug cache', async () => {
    const { service, db } = build();
    await service.byIdOrThrow('t1');
    service.invalidate({ id: 't1', slug: 'decorbucket' } as never);
    await service.byIdOrThrow('t1');
    expect(db.tenant.findUnique).toHaveBeenCalledTimes(2);
  });
});

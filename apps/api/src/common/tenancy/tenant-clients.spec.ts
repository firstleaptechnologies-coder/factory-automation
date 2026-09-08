import { TenantIsolation } from '@prisma/client';
import {
  TENANT_SCOPED_MODELS,
  TenantClientRegistry,
  scopeToTenant,
} from './tenant-clients';
import { PLATFORM_CONTEXT, TenantContext } from './tenant-context';

const opened: string[] = [];

jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  return {
    ...actual,
    PrismaClient: class {
      constructor(options?: { datasources: { db: { url: string } } }) {
        opened.push(options?.datasources.db.url ?? 'default');
      }
      $extends() {
        return { extendedFrom: this };
      }
      $disconnect = jest.fn(async () => undefined);
    },
  };
});

type Hook = (args: {
  model?: string;
  operation: string;
  args: Record<string, unknown>;
  query: (args: unknown) => unknown;
}) => Promise<unknown>;

/**
 * `scopeToTenant` hands Prisma an extension rather than doing the work itself,
 * so the test captures that extension's `$allOperations` hook and drives it
 * directly. That is the only place the rule lives.
 */
function hookFor(tenantId = 'tenant-a'): { hook: Hook; passed: unknown[] } {
  let captured: Hook | undefined;
  const client = {
    $extends(config: {
      query: { $allModels: { $allOperations: Hook } };
    }) {
      captured = config.query.$allModels.$allOperations;
      return {};
    },
  };
  scopeToTenant(client as never, tenantId);
  const passed: unknown[] = [];
  return {
    hook: (input) => captured!({ ...input, query: (args) => (passed.push(args), args) }),
    passed,
  };
}

const run = async (operation: string, args: Record<string, unknown>, model = 'Order') => {
  const { hook, passed } = hookFor();
  await hook({ model, operation, args, query: () => undefined });
  return passed[0] as Record<string, unknown>;
};

beforeEach(() => {
  opened.length = 0;
});

describe('the scoped-model list', () => {
  it('leaves the control-plane models out', () => {
    // Tenant and PlatformUser span tenants by definition; scoping them would
    // make the platform screens see nothing.
    expect(TENANT_SCOPED_MODELS.has('Tenant')).toBe(false);
    expect(TENANT_SCOPED_MODELS.has('PlatformUser')).toBe(false);
  });

  it('covers the models that hold a shop’s data', () => {
    for (const model of ['Order', 'Payment', 'Client', 'Lead', 'Estimate', 'Disbursement']) {
      expect(TENANT_SCOPED_MODELS.has(model)).toBe(true);
    }
  });
});

describe('reads', () => {
  it('narrows a findMany to the tenant', async () => {
    expect(await run('findMany', {})).toEqual({ where: { tenantId: 'tenant-a' } });
  });

  it('keeps the caller’s own filter alongside the tenant', async () => {
    const args = await run('findMany', { where: { statusId: 's1' } });
    expect(args.where).toEqual({ statusId: 's1', tenantId: 'tenant-a' });
  });

  it('narrows findUnique too, so an id from another shop finds nothing', async () => {
    const args = await run('findUnique', { where: { id: 'o1' } });
    expect(args.where).toEqual({ id: 'o1', tenantId: 'tenant-a' });
  });

  it('narrows count, aggregate and groupBy', async () => {
    for (const operation of ['count', 'aggregate', 'groupBy']) {
      expect((await run(operation, {})).where).toEqual({ tenantId: 'tenant-a' });
    }
  });

  it('cannot be overridden by a caller passing another tenant', async () => {
    const args = await run('findMany', { where: { tenantId: 'tenant-b' } });
    // The scope is applied last, so it wins.
    expect(args.where).toEqual({ tenantId: 'tenant-a' });
  });
});

describe('writes', () => {
  it('stamps the tenant onto a create', async () => {
    const args = await run('create', { data: { code: 'ORD-1' } });
    expect(args.data).toEqual({ code: 'ORD-1', tenantId: 'tenant-a' });
  });

  it('stamps every row of a createMany', async () => {
    const args = await run('createMany', { data: [{ a: 1 }, { a: 2 }] });
    expect(args.data).toEqual([
      { a: 1, tenantId: 'tenant-a' },
      { a: 2, tenantId: 'tenant-a' },
    ]);
  });

  it('handles a createMany given a single object', async () => {
    const args = await run('createMany', { data: { a: 1 } });
    expect(args.data).toEqual({ a: 1, tenantId: 'tenant-a' });
  });

  it('stamps an upsert’s create branch and narrows its where', async () => {
    const args = await run('upsert', {
      where: { id: 'o1' },
      create: { code: 'ORD-1' },
      update: { code: 'ORD-1' },
    });
    expect(args.create).toEqual({ code: 'ORD-1', tenantId: 'tenant-a' });
    expect(args.where).toEqual({ id: 'o1', tenantId: 'tenant-a' });
  });

  it('narrows an update and a delete, so neither can reach another shop’s row', async () => {
    expect((await run('update', { where: { id: 'o1' }, data: {} })).where).toEqual({
      id: 'o1',
      tenantId: 'tenant-a',
    });
    expect((await run('delete', { where: { id: 'o1' } })).where).toEqual({
      id: 'o1',
      tenantId: 'tenant-a',
    });
  });

  it('narrows deleteMany, which would otherwise empty the table for everyone', async () => {
    expect((await run('deleteMany', {})).where).toEqual({ tenantId: 'tenant-a' });
  });
});

describe('models outside the scope', () => {
  it('passes a control-plane query straight through', async () => {
    const args = await run('findMany', { where: { slug: 'x' } }, 'Tenant');
    expect(args).toEqual({ where: { slug: 'x' } });
  });

  it('passes a raw query with no model through', async () => {
    const { hook, passed } = hookFor();
    await hook({ operation: '$queryRaw', args: { sql: 'select 1' }, query: () => undefined });
    expect(passed[0]).toEqual({ sql: 'select 1' });
  });
});

describe('TenantClientRegistry', () => {
  const platform = { id: 'platform' } as never;
  const tenant = (over: Partial<TenantContext> = {}): TenantContext => ({
    tenantId: 'tenant-a',
    slug: 'a',
    isolation: TenantIsolation.SHARED,
    ...over,
  });

  it('hands the platform context the unscoped client', () => {
    const registry = new TenantClientRegistry(platform);
    expect(registry.for(PLATFORM_CONTEXT)).toBe(platform);
    expect(registry.platform()).toBe(platform);
  });

  it('reuses the scoped client between requests for the same tenant', () => {
    const registry = new TenantClientRegistry({ $extends: () => ({}) } as never);
    const first = registry.for(tenant());
    expect(registry.for(tenant())).toBe(first);
  });

  it('keeps tenants on separate scoped clients', () => {
    const registry = new TenantClientRegistry({ $extends: () => ({}) } as never);
    const a = registry.for(tenant());
    const b = registry.for(tenant({ tenantId: 'tenant-b' }));
    expect(a).not.toBe(b);
  });

  it('opens one connection pool per dedicated database, not one per request', () => {
    const registry = new TenantClientRegistry({ $extends: () => ({}) } as never);
    const dedicated = tenant({
      isolation: TenantIsolation.DEDICATED,
      databaseUrl: 'postgres://dedicated',
    });
    registry.for(dedicated);
    registry.for({ ...dedicated, tenantId: 'tenant-c' });
    // A pool per request would exhaust Postgres long before the tenant list.
    expect(opened).toEqual(['postgres://dedicated']);
  });

  it('closes every dedicated pool on shutdown', async () => {
    const registry = new TenantClientRegistry({ $extends: () => ({}) } as never);
    registry.for(
      tenant({ isolation: TenantIsolation.DEDICATED, databaseUrl: 'postgres://dedicated' }),
    );
    await registry.disconnectAll();
    // The cache is cleared too, so a reconnect does not hand back a dead pool.
    registry.for(
      tenant({ isolation: TenantIsolation.DEDICATED, databaseUrl: 'postgres://dedicated' }),
    );
    expect(opened).toHaveLength(2);
  });
});

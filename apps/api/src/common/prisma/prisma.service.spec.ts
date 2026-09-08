import { PrismaService } from './prisma.service';
import { TENANT_SCOPED_MODELS } from '../tenancy/tenant-clients';
import { runInTenant } from '../tenancy/tenant-context';

/**
 * A stand-in for the real client. What matters here is which object a model
 * delegate is served from, not what Prisma does with it afterwards.
 */
function serviceWithRegistry() {
  const scopedClients: Record<string, Record<string, unknown>> = {};
  const instance = Object.create(PrismaService.prototype) as PrismaService;

  Object.assign(instance, {
    order: { source: 'platform' },
    tenant: { source: 'platform' },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    plainMethod(this: unknown) {
      return this;
    },
  });

  // `registry` is private to the service; the test stands one in its place.
  (instance as unknown as Record<string, unknown>).registry = {
    for: (context: { tenantId: string | null }) => {
      const key = context?.tenantId ?? 'platform';
      scopedClients[key] ??= { order: { source: key }, client: { source: key } };
      return scopedClients[key];
    },
  };

  return { prisma: PrismaService.wrap(instance as PrismaService), scopedClients };
}

const inTenant = <T>(tenantId: string, run: () => T): T =>
  runInTenant({ tenantId, slug: tenantId, isolation: 'SHARED' } as never, run);

it('serves a tenant-scoped model from that tenant’s own client', () => {
  const { prisma } = serviceWithRegistry();
  const order = inTenant('t1', () => (prisma as unknown as Record<string, unknown>).order);
  expect(order).toEqual({ source: 't1' });
});

it('keeps two tenants on different clients', () => {
  const { prisma } = serviceWithRegistry();
  const first = inTenant('t1', () => (prisma as unknown as Record<string, unknown>).order);
  const second = inTenant('t2', () => (prisma as unknown as Record<string, unknown>).order);
  expect(first).not.toBe(second);
});

it('refuses a tenant-scoped model when no tenant is in scope', () => {
  const { prisma } = serviceWithRegistry();
  // Throwing beats quietly returning every tenant's rows.
  expect(() => (prisma as unknown as Record<string, unknown>).order).toThrow();
});

it('hands the control plane the unscoped instance, not the proxy', () => {
  const { prisma } = serviceWithRegistry();
  const platform = (prisma as unknown as { platform: Record<string, unknown> }).platform;
  // Resolving this through the proxy left Prisma's delegates bound to the
  // wrong object, and every platform query saw undefined.
  expect(platform.order).toEqual({ source: 'platform' });
});

it('lets the control plane read a tenant-scoped model with no tenant in scope', () => {
  const { prisma } = serviceWithRegistry();
  const platform = (prisma as unknown as { platform: Record<string, unknown> }).platform;
  expect(() => platform.order).not.toThrow();
});

it('passes anything that is not a model straight through', () => {
  const { prisma } = serviceWithRegistry();
  expect(typeof (prisma as unknown as Record<string, unknown>).$connect).toBe('function');
});

it('binds methods to the real instance, so Prisma’s delegates materialise', () => {
  const { prisma } = serviceWithRegistry();
  const method = (prisma as unknown as { plainMethod: () => unknown }).plainMethod;
  // Called with `this` as the proxy, a lazy delegate never appears.
  expect(method()).not.toBe(prisma);
});

it('routes every model the registry considers tenant-scoped', () => {
  const { prisma } = serviceWithRegistry();
  const asRecord = prisma as unknown as Record<string, unknown>;
  // The set is the single list; a model missing from it is a model that would
  // silently read across tenants.
  expect(TENANT_SCOPED_MODELS.has('Order')).toBe(true);
  expect(TENANT_SCOPED_MODELS.has('Tenant')).toBe(false);
  expect(inTenant('t1', () => asRecord.client)).toEqual({ source: 't1' });
  expect(asRecord.tenant).toEqual({ source: 'platform' });
});

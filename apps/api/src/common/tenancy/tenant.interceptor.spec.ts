import { TenantIsolation } from '@prisma/client';
import { ALL_MODULES } from '@decor/shared';
import { TenantInterceptor } from './tenant.interceptor';
import { currentTenant, isPlatformContext } from './tenant-context';

const TENANT = {
  tenantId: 'tenant-a',
  slug: 'a',
  isolation: TenantIsolation.SHARED,
  // What the workspace bought; irrelevant to these tests, so: everything.
  modules: ALL_MODULES,
};

/** The handler reports the context it was actually invoked inside. */
function run(user: unknown) {
  let seen: ReturnType<typeof currentTenant>;
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  };
  const next = {
    handle: () => {
      seen = currentTenant();
      return 'handled';
    },
  };
  const result = new TenantInterceptor().intercept(context as never, next as never);
  return { seen, result };
}

it('puts the signed-in user’s tenant into context for the whole call', () => {
  const { seen, result } = run({ tenant: TENANT });
  expect(seen).toEqual(TENANT);
  expect(result).toBe('handled');
});

it('takes the tenant from the verified token, not from the request', () => {
  // A caller naming the tenant they want to read would be reading another
  // business's orders.
  const { seen } = run({ tenant: TENANT, tenantId: 'tenant-b' });
  expect(seen?.tenantId).toBe('tenant-a');
});

it('runs a platform admin in the platform context', () => {
  const { seen } = run({ isPlatform: true });
  expect(isPlatformContext(seen)).toBe(true);
});

it('prefers the platform context when a user somehow carries both', () => {
  const { seen } = run({ isPlatform: true, tenant: TENANT });
  expect(isPlatformContext(seen)).toBe(true);
});

it('leaves an unauthenticated request with no context, so a stray query throws', () => {
  const { seen, result } = run(undefined);
  expect(seen).toBeUndefined();
  expect(result).toBe('handled');
});

it('leaves a user with no tenant alone rather than inventing one', () => {
  const { seen } = run({ id: 'u1' });
  expect(seen).toBeUndefined();
});

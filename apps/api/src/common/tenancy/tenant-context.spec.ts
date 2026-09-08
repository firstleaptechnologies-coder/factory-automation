import { TenantIsolation } from '@prisma/client';
import { ALL_MODULES } from '@decor/shared';
import {
  PLATFORM_CONTEXT,
  currentTenant,
  isPlatformContext,
  requireTenant,
  runAsPlatform,
  runInTenant,
  tenantId,
} from './tenant-context';

const SHOP = {
  tenantId: 'tenant-a',
  slug: 'shop-a',
  isolation: TenantIsolation.SHARED,
  // What the workspace bought; irrelevant to these tests, so: everything.
  modules: ALL_MODULES,
};

describe('tenant context', () => {
  it('refuses to answer outside a tenant', () => {
    // The whole safety property: no ambient default, so a query written without
    // a tenant fails loudly instead of quietly reading someone else's data.
    expect(currentTenant()).toBeUndefined();
    expect(() => requireTenant()).toThrow();
    expect(() => tenantId()).toThrow();
  });

  it('confines a call to one tenant', () => {
    runInTenant(SHOP, () => {
      expect(tenantId()).toBe('tenant-a');
    });
    expect(currentTenant()).toBeUndefined();
  });

  it('does not leak a tenant out of a nested call', () => {
    runInTenant(SHOP, () => {
      runInTenant({ ...SHOP, tenantId: 'tenant-b', slug: 'shop-b' }, () => {
        expect(tenantId()).toBe('tenant-b');
      });
      expect(tenantId()).toBe('tenant-a');
    });
  });

  it('marks the control plane with its own sentinel tenant', () => {
    runAsPlatform(() => {
      expect(isPlatformContext(currentTenant())).toBe(true);
      // Not a real workspace id — it is a sentinel the Prisma proxy checks for
      // so control-plane queries bypass tenant filtering rather than being
      // scoped to a workspace that does not exist.
      expect(tenantId()).toBe(PLATFORM_CONTEXT.tenantId);
      expect(tenantId()).not.toBe('tenant-a');
    });
  });

  it('does not treat an ordinary shop as the platform', () => {
    expect(isPlatformContext(SHOP)).toBe(false);
    expect(isPlatformContext(PLATFORM_CONTEXT)).toBe(true);
  });
});

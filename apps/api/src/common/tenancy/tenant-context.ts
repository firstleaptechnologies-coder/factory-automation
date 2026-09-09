import { AsyncLocalStorage } from 'node:async_hooks';
import { TenantIsolation } from '@prisma/client';
import { CORE_MODULES, type ModuleKey } from '@fas/shared';

export interface TenantContext {
  tenantId: string;
  slug: string;
  isolation: TenantIsolation;
  /** Only set for DEDICATED tenants. */
  databaseUrl?: string | null;
  /**
   * What this workspace has bought, resolved from their plan and whatever was
   * granted on top of it. Read on every request, so it is cached with the rest
   * of the context rather than looked up per check.
   */
  modules: ModuleKey[];
}

/**
 * The tenant the current request belongs to.
 *
 * Held in async local storage rather than passed down through every service
 * signature. Tenant scoping has to be impossible to forget — a query that
 * silently ran without it would return another business's orders — so the
 * context follows the request automatically and the Prisma proxy reads it on
 * every call.
 */
const storage = new AsyncLocalStorage<TenantContext>();

export function runInTenant<T>(context: TenantContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentTenant(): TenantContext | undefined {
  return storage.getStore();
}

export function requireTenant(): TenantContext {
  const context = storage.getStore();
  if (!context) {
    // Reaching here means a tenant-scoped query ran outside a request, which is
    // a bug rather than a user error: failing loudly beats leaking rows.
    throw new Error(
      'No tenant in context — a tenant-scoped query ran outside a tenant request',
    );
  }
  return context;
}

/** Escape hatch for the platform layer, which legitimately spans tenants. */
export function runAsPlatform<T>(fn: () => T): T {
  return storage.run(PLATFORM_CONTEXT, fn);
}

export const PLATFORM_CONTEXT: TenantContext = {
  tenantId: '__platform__',
  slug: '__platform__',
  isolation: TenantIsolation.SHARED,
  // The control plane sells the modules; it does not use them.
  modules: [...CORE_MODULES],
};

export function isPlatformContext(context?: TenantContext): boolean {
  return context?.tenantId === PLATFORM_CONTEXT.tenantId;
}

/**
 * The current tenant's id, for the few places that must name it explicitly.
 *
 * Reads are filtered automatically by the Prisma proxy, so nothing can leak by
 * omission. Writes are different: the compiler requires tenantId on a create,
 * which means a new write cannot be added without deciding which tenant it
 * belongs to. That is the right way round — silent reads are dangerous, silent
 * writes are merely wrong, and the compiler can only catch one of them.
 */
export function tenantId(): string {
  return requireTenant().tenantId;
}

import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantClientRegistry, TENANT_SCOPED_MODELS } from '../tenancy/tenant-clients';
import { currentTenant, PLATFORM_CONTEXT, requireTenant } from '../tenancy/tenant-context';

/**
 * The database, as every service sees it.
 *
 * Services write `this.prisma.order.findMany(...)` exactly as before, but what
 * they get is the client for whichever tenant the request belongs to, already
 * filtered to that tenant. The indirection is a proxy rather than a new
 * injectable so that adding tenancy did not require touching a single query —
 * and, more importantly, so no future query can opt out of it.
 *
 * Pooled tenants share this connection; a dedicated tenant's queries are routed
 * to its own database. Neither is visible from a service.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private registry!: TenantClientRegistry;

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.registry = new TenantClientRegistry(this);
  }

  async onModuleDestroy(): Promise<void> {
    await this.registry?.disconnectAll();
    await this.$disconnect();
  }

  /** The unscoped connection. Control plane only — it can see every tenant. */
  get platform(): PrismaClient {
    return this;
  }

  /**
   * The client for the current request's tenant.
   *
   * Named `scoped` rather than `client` because `prisma.client` is already the
   * delegate for the Client model.
   */
  get scoped(): PrismaClient {
    const context = currentTenant() ?? PLATFORM_CONTEXT;
    return this.registry.for(context) as PrismaClient;
  }

  /**
   * Model accessors resolve through the tenant client.
   *
   * Nest injects this class, so the proxy has to be installed on the instance
   * itself: any property that names a tenant-scoped model is served from the
   * scoped client instead of this raw one.
   */
  static wrap(instance: PrismaService): PrismaService {
    return new Proxy(instance, {
      get(target, property) {
        // Hand back the raw instance, not the proxy: control-plane queries must
        // not be routed through tenant scoping, and resolving this through a
        // getter left Prisma's delegates bound to the wrong object.
        if (property === 'platform') return target;

        if (typeof property === 'string') {
          const model = property.charAt(0).toUpperCase() + property.slice(1);
          if (TENANT_SCOPED_MODELS.has(model)) {
            // Throws when there is no tenant, rather than quietly returning
            // every tenant's rows.
            requireTenant();
            return (target.scoped as unknown as Record<string, unknown>)[property];
          }
        }

        // Read from the instance itself, not through the proxy. Prisma defines
        // its model delegates lazily and they close over the real client — if
        // `this` arrives as the proxy instead, the delegate never materialises
        // and every platform query sees undefined.
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
}

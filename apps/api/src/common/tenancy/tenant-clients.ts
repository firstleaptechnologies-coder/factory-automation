import { Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TenantContext, isPlatformContext } from './tenant-context';

const logger = new Logger('TenantClients');

/**
 * Models that hold one tenant's business data.
 *
 * Anything listed here is filtered by tenantId on every read and stamped with
 * it on every write. Tenant and PlatformUser are deliberately absent: they are
 * the control plane and span tenants by definition.
 */
export const TENANT_SCOPED_MODELS = new Set([
  'User', 'Role', 'GstSlab', 'Client', 'ClientLocation', 'Material',
  'MaterialThickness', 'SizePreset', 'Workflow', 'WorkflowStatus',
  'WorkflowTransition', 'StoredFile', 'Order', 'OrderItem', 'OrderAttachment',
  'OrderStatusHistory', 'Payment', 'CashDeposit', 'LeadSource',
  'CustomFieldDefinition', 'Lead', 'LeadStatusHistory', 'AppSetting',
  'DocumentSequence', 'AuditLog',
]);

/** Operations whose `where` should be narrowed to the tenant. */
const FILTERED = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow',
  'findMany', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany',
  'update', 'delete', 'upsert',
]);

/** Operations that create rows and therefore need the tenant stamped on. */
const CREATING = new Set(['create', 'createMany', 'upsert']);

/**
 * Wrap a client so every tenant-scoped query is confined to one tenant.
 *
 * Doing this once here, rather than in each service, is the whole point: a
 * developer adding a new query cannot accidentally omit the filter, because
 * there is no query path that bypasses this.
 */
export function scopeToTenant(client: PrismaClient, tenantId: string) {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) return query(args);

          const next = { ...(args as Record<string, unknown>) };

          if (FILTERED.has(operation)) {
            next.where = { ...((next.where as object) ?? {}), tenantId };
          }

          if (CREATING.has(operation)) {
            if (operation === 'createMany') {
              const data = next.data as Record<string, unknown>[] | Record<string, unknown>;
              next.data = Array.isArray(data)
                ? data.map((row) => ({ ...row, tenantId }))
                : { ...data, tenantId };
            } else if (operation === 'upsert') {
              next.create = { ...((next.create as object) ?? {}), tenantId };
            } else {
              next.data = { ...((next.data as object) ?? {}), tenantId };
            }
          }

          return query(next);
        },
      },
    },
  });
}

export type ScopedClient = ReturnType<typeof scopeToTenant>;

/**
 * One client per physical database, kept alive between requests.
 *
 * Pooled tenants all share the platform client; a dedicated tenant gets its own
 * connection pool, created on first use. Opening a connection per request would
 * exhaust Postgres long before it exhausted the tenant list.
 */
export class TenantClientRegistry {
  private readonly byUrl = new Map<string, PrismaClient>();
  private readonly scoped = new Map<string, ScopedClient>();

  constructor(private readonly platformClient: PrismaClient) {}

  /** The unscoped platform client — control-plane use only. */
  platform(): PrismaClient {
    return this.platformClient;
  }

  for(context: TenantContext): PrismaClient | ScopedClient {
    if (isPlatformContext(context)) return this.platformClient;

    const cacheKey = `${context.databaseUrl ?? 'shared'}::${context.tenantId}`;
    const cached = this.scoped.get(cacheKey);
    if (cached) return cached;

    const base = context.databaseUrl
      ? this.clientFor(context.databaseUrl)
      : this.platformClient;

    const scoped = scopeToTenant(base, context.tenantId);
    this.scoped.set(cacheKey, scoped);
    return scoped;
  }

  private clientFor(databaseUrl: string): PrismaClient {
    const existing = this.byUrl.get(databaseUrl);
    if (existing) return existing;

    logger.log('Opening a connection pool for a dedicated tenant database');
    const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    this.byUrl.set(databaseUrl, client);
    return client;
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.byUrl.values()].map((client) => client.$disconnect()));
    this.byUrl.clear();
    this.scoped.clear();
  }
}

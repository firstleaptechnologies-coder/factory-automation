import { Injectable, NotFoundException } from '@nestjs/common';
import { Tenant, TenantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../crypto/encryption.service';
import { modulesFor, modulesForTier } from '@fas/shared';
import { TenantContext } from './tenant-context';

/**
 * Where tenants are looked up.
 *
 * The registry lives in the platform database and is read on every request, so
 * it is cached — a tenant's isolation mode changes about once in its lifetime,
 * and hitting the control plane for each call would put a query in front of
 * every other query.
 */
@Injectable()
export class TenantRegistryService {
  private readonly bySlug = new Map<string, TenantContext>();
  private readonly byId = new Map<string, TenantContext>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async bySlugOrThrow(slug: string): Promise<TenantContext> {
    const cached = this.bySlug.get(slug.toLowerCase());
    if (cached) return cached;

    const tenant = await this.prisma.platform.tenant.findUnique({
      where: { slug: slug.toLowerCase() },
    });
    if (!tenant) throw new NotFoundException(`No workspace found for "${slug}"`);
    return this.cache(tenant, await this.tierModules(tenant.plan));
  }

  async byIdOrThrow(id: string): Promise<TenantContext> {
    const cached = this.byId.get(id);
    if (cached) return cached;

    const tenant = await this.prisma.platform.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Workspace not found');
    return this.cache(tenant, await this.tierModules(tenant.plan));
  }

  /** Call after changing a tenant's isolation, status or database. */
  invalidate(tenant: Pick<Tenant, 'id' | 'slug'>): void {
    this.byId.delete(tenant.id);
    this.bySlug.delete(tenant.slug);
  }

  /**
   * Call after editing a tier.
   *
   * A tier is shared by every workspace on it, and what it includes is cached
   * per workspace. Without this, moving a module into Shop changes the price
   * list and nothing else until the API is restarted — which looks exactly
   * like a screen that does not work.
   */
  invalidateAll(): void {
    this.byId.clear();
    this.bySlug.clear();
  }

  /**
   * What the workspace's tier includes, as it is written today.
   *
   * From the row rather than the compiled `PLANS` list, because the owner
   * edits tiers: a module moved into Shop this morning has to be reachable by
   * every Shop workspace this afternoon, not at the next release. A tier with
   * no row — an older key, a tier deleted underneath a workspace — falls back
   * to the seeded definition, which is a working product rather than a blank
   * one.
   */
  private async tierModules(plan: string | null): Promise<string[] | null> {
    if (!plan) return null;
    const tier = await this.prisma.platform.subscriptionTier.findUnique({
      where: { key: plan },
      select: { includedModules: true, isActive: true },
    });
    return tier ? tier.includedModules : null;
  }

  private cache(tenant: Tenant, tierModules: string[] | null): TenantContext {
    if (tenant.status === TenantStatus.SUSPENDED) {
      throw new NotFoundException(
        `${tenant.name} is suspended. Contact your provider.`,
      );
    }

    const context: TenantContext = {
      tenantId: tenant.id,
      slug: tenant.slug,
      isolation: tenant.isolation,
      // Connection strings are stored encrypted; they are the keys to another
      // business's entire database.
      databaseUrl: tenant.databaseUrl
        ? this.encryption.decryptToString(tenant.databaseUrl)
        : null,
      // Resolved here so a module check is a lookup in memory rather than a
      // query in front of every request.
      modules: tierModules
        ? modulesForTier(tierModules, tenant.modules ?? [])
        : modulesFor(tenant.plan, tenant.modules ?? []),
    };

    this.bySlug.set(tenant.slug, context);
    this.byId.set(tenant.id, context);
    return context;
  }
}

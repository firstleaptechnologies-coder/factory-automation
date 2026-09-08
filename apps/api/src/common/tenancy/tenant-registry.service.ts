import { Injectable, NotFoundException } from '@nestjs/common';
import { Tenant, TenantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../crypto/encryption.service';
import { modulesFor } from '@decor/shared';
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
    return this.cache(tenant);
  }

  async byIdOrThrow(id: string): Promise<TenantContext> {
    const cached = this.byId.get(id);
    if (cached) return cached;

    const tenant = await this.prisma.platform.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Workspace not found');
    return this.cache(tenant);
  }

  /** Call after changing a tenant's isolation, status or database. */
  invalidate(tenant: Pick<Tenant, 'id' | 'slug'>): void {
    this.byId.delete(tenant.id);
    this.bySlug.delete(tenant.slug);
  }

  private cache(tenant: Tenant): TenantContext {
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
      modules: modulesFor(tenant.plan, tenant.modules ?? []),
    };

    this.bySlug.set(tenant.slug, context);
    this.byId.set(tenant.id, context);
    return context;
  }
}

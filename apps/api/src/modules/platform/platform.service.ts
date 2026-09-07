import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, TenantIsolation, TenantStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { TenantRegistryService } from '../../common/tenancy/tenant-registry.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import {
  ChangeIsolationDto,
  CreateTenantDto,
  UpdateTenantDto,
} from './dto/tenant.dto';

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly registry: TenantRegistryService,
    private readonly provisioning: TenantProvisioningService,
  ) {}

  private get db(): PrismaClient {
    return this.prisma.platform;
  }

  async list() {
    const tenants = await this.db.tenant.findMany({ orderBy: { createdAt: 'desc' } });

    // Counts come from each tenant's own data, which for a dedicated tenant
    // lives in another database entirely — so they are gathered per tenant
    // rather than in one join.
    return Promise.all(
      tenants.map(async (tenant) => ({
        ...redact(tenant),
        counts: await this.countsFor(tenant.id, tenant.databaseUrl),
      })),
    );
  }

  async findOne(id: string) {
    const tenant = await this.db.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Workspace not found');
    return {
      ...redact(tenant),
      counts: await this.countsFor(tenant.id, tenant.databaseUrl),
    };
  }

  /**
   * Create a workspace and stand it up ready to use.
   *
   * A dedicated tenant's schema must already exist at the supplied connection
   * string — this creates the rows, not the database, because running
   * migrations against an arbitrary URL supplied over HTTP is not something an
   * API endpoint should do.
   */
  async create(dto: CreateTenantDto) {
    const slug = dto.slug.toLowerCase();
    const existing = await this.db.tenant.findUnique({ where: { slug } });
    if (existing) throw new ConflictException(`Workspace "${slug}" is taken`);

    const isolation = dto.isolation ?? TenantIsolation.SHARED;
    if (isolation === TenantIsolation.DEDICATED && !dto.databaseUrl) {
      throw new BadRequestException(
        'A dedicated workspace needs the connection string for its database',
      );
    }

    const tenant = await this.db.tenant.create({
      data: {
        slug,
        name: dto.name,
        isolation,
        databaseUrl: dto.databaseUrl
          ? this.encryption.encrypt(dto.databaseUrl)
          : null,
        plan: dto.plan,
        status: TenantStatus.TRIAL,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        notes: dto.notes,
      },
    });

    const target = dto.databaseUrl
      ? new PrismaClient({ datasources: { db: { url: dto.databaseUrl } } })
      : this.db;

    try {
      await this.provisioning.seed(target, tenant.id, {
        name: dto.ownerName,
        code: dto.ownerCode,
        password: dto.ownerPassword,
        email: dto.ownerEmail,
      });
    } catch (error) {
      // A half-provisioned workspace is worse than none: someone would sign in
      // to a shop with no statuses and no materials.
      await this.db.tenant.delete({ where: { id: tenant.id } });
      throw new BadRequestException(
        `Could not set up the workspace: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      if (dto.databaseUrl) await (target as PrismaClient).$disconnect();
    }

    return {
      ...redact(tenant),
      signIn: { workspace: slug, code: dto.ownerCode.toUpperCase() },
    };
  }

  async update(id: string, dto: UpdateTenantDto) {
    const tenant = await this.db.tenant.update({ where: { id }, data: dto });
    this.registry.invalidate(tenant);
    return redact(tenant);
  }

  /** Move a tenant between pooled and dedicated. The data copy is separate. */
  async changeIsolation(id: string, dto: ChangeIsolationDto) {
    if (dto.isolation === TenantIsolation.DEDICATED && !dto.databaseUrl) {
      throw new BadRequestException('Moving to dedicated needs a connection string');
    }

    const tenant = await this.db.tenant.update({
      where: { id },
      data: {
        isolation: dto.isolation,
        databaseUrl:
          dto.isolation === TenantIsolation.DEDICATED
            ? this.encryption.encrypt(dto.databaseUrl!)
            : null,
      },
    });
    this.registry.invalidate(tenant);
    return redact(tenant);
  }

  private async countsFor(tenantId: string, encryptedUrl: string | null) {
    const db = encryptedUrl
      ? new PrismaClient({
          datasources: { db: { url: this.encryption.decryptToString(encryptedUrl) } },
        })
      : this.db;

    try {
      const [users, orders, clients] = await Promise.all([
        db.user.count({ where: { tenantId } }),
        db.order.count({ where: { tenantId } }),
        db.client.count({ where: { tenantId } }),
      ]);
      return { users, orders, clients };
    } catch {
      // A dedicated database that is unreachable should not take the whole
      // tenant list down with it.
      return { users: null, orders: null, clients: null, unreachable: true };
    } finally {
      if (encryptedUrl) await (db as PrismaClient).$disconnect();
    }
  }
}

/** Never return a connection string over the API, even to a platform admin. */
function redact<T extends { databaseUrl: string | null }>(tenant: T) {
  const { databaseUrl, ...rest } = tenant;
  return { ...rest, hasDedicatedDatabase: Boolean(databaseUrl) };
}

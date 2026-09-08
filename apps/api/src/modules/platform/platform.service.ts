import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient, TenantIsolation, TenantStatus } from '@prisma/client';
import { modulesFor } from '@decor/shared';
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
export class PlatformService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly registry: TenantRegistryService,
    private readonly provisioning: TenantProvisioningService,
  ) {}

  private readonly logger = new Logger(PlatformService.name);

  private get db(): PrismaClient {
    return this.prisma.platform;
  }

  /**
   * Roles are seeded once, at provisioning, so a permission introduced by a
   * later release would never reach a workspace that already exists. Reconcile
   * the stock roles on boot; tenants' own roles are left alone.
   */
  async onModuleInit(): Promise<void> {
    try {
      // A suspended workspace nobody can sign into gains nothing from this;
      // a trial one is in daily use and must not be left behind a release.
      const tenants = await this.db.tenant.findMany({
        where: { status: { not: TenantStatus.SUSPENDED } },
        select: { id: true, slug: true, databaseUrl: true },
      });
      for (const tenant of tenants) {
        const db = tenant.databaseUrl
          ? new PrismaClient({
              datasources: {
                db: { url: this.encryption.decryptToString(tenant.databaseUrl) },
              },
            })
          : this.db;
        try {
          await this.provisioning.syncSystemRoles(db, tenant.id);
        } catch (error) {
          // One unreachable dedicated database must not stop the API booting.
          this.logger.warn(`Could not sync roles for ${tenant.slug}: ${String(error)}`);
        } finally {
          if (tenant.databaseUrl) await (db as PrismaClient).$disconnect();
        }
      }
    } catch (error) {
      this.logger.warn(`Role sync skipped: ${String(error)}`);
    }
  }

  async list() {
    const tenants = await this.db.tenant.findMany({ orderBy: { createdAt: 'desc' } });

    // One pass over the telemetry for everybody, rather than a query per
    // workspace: it is all in the platform database precisely so that a view
    // across tenants costs one read.
    const health = await this.health();

    // Counts come from each tenant's own data, which for a dedicated tenant
    // lives in another database entirely — so they are gathered per tenant
    // rather than in one join.
    return Promise.all(
      tenants.map(async (tenant) => ({
        ...redact(tenant),
        counts: await this.countsFor(tenant.id, tenant.databaseUrl),
        health: health.get(tenant.id) ?? EMPTY_HEALTH,
      })),
    );
  }

  /**
   * Is anybody using it, and is it working for them?
   *
   * Read from the operational log rather than from each shop's own data: a
   * workspace with orders in it that nobody has opened for three weeks is a
   * different problem from a quiet one, and only the log knows the difference.
   *
   * Nothing here reaches into a tenant's database.
   */
  private async health(): Promise<Map<string, TenantHealth>> {
    const since = new Date(Date.now() - HEALTH_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [activity, failures, clientErrors] = await Promise.all([
      this.db.serverLog.groupBy({
        by: ['tenantId'],
        where: { at: { gte: since } },
        _count: { _all: true },
        _max: { at: true },
      }),
      this.db.serverLog.groupBy({
        by: ['tenantId'],
        where: { at: { gte: since }, outcome: 'failed' },
        _count: { _all: true },
      }),
      this.db.clientLog.groupBy({
        by: ['tenantId'],
        where: { receivedAt: { gte: since }, level: 'error' },
        _count: { _all: true },
      }),
    ]);

    const health = new Map<string, TenantHealth>();
    for (const row of activity) {
      if (!row.tenantId) continue;
      health.set(row.tenantId, {
        ...EMPTY_HEALTH,
        writes: row._count._all,
        lastSeenAt: row._max.at?.toISOString() ?? null,
      });
    }
    for (const row of failures) {
      if (!row.tenantId) continue;
      const found = health.get(row.tenantId) ?? { ...EMPTY_HEALTH };
      health.set(row.tenantId, { ...found, failures: row._count._all });
    }
    for (const row of clientErrors) {
      if (!row.tenantId) continue;
      const found = health.get(row.tenantId) ?? { ...EMPTY_HEALTH };
      health.set(row.tenantId, { ...found, clientErrors: row._count._all });
    }
    return health;
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
/** How far back the health figures look. A fortnight sees a quiet week. */
const HEALTH_WINDOW_DAYS = 14;

export interface TenantHealth {
  /** The last time anybody in this workspace changed anything. */
  lastSeenAt: string | null;
  /** Writes recorded in the window. Reads are not logged. */
  writes: number;
  /** Times the API broke for them. */
  failures: number;
  /** Errors their app or browser reported. */
  clientErrors: number;
}

const EMPTY_HEALTH: TenantHealth = {
  lastSeenAt: null,
  writes: 0,
  failures: 0,
  clientErrors: 0,
};

function redact<T extends { databaseUrl: string | null; plan?: string | null; modules?: string[] }>(
  tenant: T,
) {
  const { databaseUrl, ...rest } = tenant;
  return {
    ...rest,
    hasDedicatedDatabase: Boolean(databaseUrl),
    // What the plan and the extras add up to, so the console does not have to
    // work it out a second time — and cannot work it out differently.
    effectiveModules: modulesFor(tenant.plan ?? null, tenant.modules ?? []),
  };
}

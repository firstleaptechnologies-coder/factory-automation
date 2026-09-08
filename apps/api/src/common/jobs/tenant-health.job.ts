import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaClient, TenantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantRegistryService } from '../tenancy/tenant-registry.service';
import { runInTenant } from '../tenancy/tenant-context';
import { JobDetail, JobRunnerService } from './job-runner.service';

export const TENANT_HEALTH = 'tenant.health';

/**
 * Can every workspace's database still be reached?
 *
 * A dedicated tenant lives in its own database, on credentials we hold and
 * somebody else's server. When one of those goes away — rotated password,
 * expired plan, a firewall rule — nothing here notices until that shop tries to
 * punch an order and cannot. Asking every night costs one round trip per
 * database and turns a support call into something already known.
 */
@Injectable()
export class TenantHealthJob {
  constructor(
    private readonly runner: JobRunnerService,
    private readonly prisma: PrismaService,
    private readonly registry: TenantRegistryService,
  ) {}

  @Cron('0 30 3 * * *', { name: TENANT_HEALTH, timeZone: 'Asia/Kolkata' })
  async nightly(): Promise<void> {
    await this.runner.run(TENANT_HEALTH, () => this.check());
  }

  async check(): Promise<JobDetail> {
    const tenants = await this.prisma.platform.tenant.findMany({
      // A suspended workspace nobody can sign into is not a problem to report.
      where: { status: { not: TenantStatus.SUSPENDED } },
      select: { id: true, slug: true },
    });

    const unreachable: string[] = [];
    // Pooled tenants all share one database; ask it once rather than once per
    // shop that happens to live in it.
    const asked = new Set<string>();

    for (const tenant of tenants) {
      try {
        const context = await this.registry.byIdOrThrow(tenant.id);
        const key = context.databaseUrl ?? '__platform__';
        if (asked.has(key)) continue;
        asked.add(key);

        const client = runInTenant(context, () => this.prisma.scoped) as PrismaClient;
        await client.$queryRaw`SELECT 1`;
      } catch {
        unreachable.push(tenant.slug);
      }
    }

    return { tenants: tenants.length, databases: asked.size, unreachable };
  }
}

import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TenantStatus } from '@prisma/client';
import { JobDetail, JobRunnerService } from '../../common/jobs/job-runner.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantRegistryService } from '../../common/tenancy/tenant-registry.service';
import { runInTenant } from '../../common/tenancy/tenant-context';
import { ReportsService } from './reports.service';

export const REPORTS_BUILD = 'reports.build';
export const REPORTS_RETENTION = 'reports.retention';

/**
 * The worker behind the reports queue.
 *
 * Two jobs, on the runner like everything else on a clock, so each gets a
 * lease and a JobRun row saying whether it ran and what it did.
 *
 * Both walk the tenant list and do their work *inside* each tenant. A `Report`
 * is tenant-scoped, so reading the queue from a cron with no tenant in context
 * throws rather than quietly returning every workspace's rows — which is what
 * happened the first time this ran, and is the guard behaving correctly. The
 * platform client is the only thing allowed to see across tenants, and it is
 * used for exactly one thing here: asking who the tenants are.
 *
 * `reports.build` runs every minute rather than nightly: somebody asking for a
 * GST summary is standing at the screen waiting for it, and a queue drained
 * once a day is not a queue. It is cheap when idle — one indexed read per
 * tenant of QUEUED.
 */
@Injectable()
export class ReportsJob {
  constructor(
    private readonly runner: JobRunnerService,
    private readonly prisma: PrismaService,
    private readonly registry: TenantRegistryService,
    private readonly reports: ReportsService,
  ) {}

  @Cron('30 * * * * *', { name: REPORTS_BUILD, timeZone: 'Asia/Kolkata' })
  build(): Promise<void> {
    return this.runner.run(REPORTS_BUILD, () => this.drainQueue());
  }

  async drainQueue(): Promise<JobDetail> {
    let built = 0;
    let failed = 0;
    let requeued = 0;

    for (const tenant of await this.activeTenants()) {
      const context = await this.registry.byIdOrThrow(tenant.id);

      await runInTenant(context, async () => {
        // Anything a worker claimed and then died holding goes back first,
        // otherwise it sits at GENERATING and whoever asked waits for
        // something nobody is doing.
        requeued += await this.reports.requeueAbandoned();

        for (const id of await this.reports.pending(5)) {
          // One at a time. These read whole quarters of the ledger, and five
          // at once on the box that is also serving requests is how a report
          // makes the app slow for everybody else.
          if (await this.reports.generateOne(id)) built += 1;
          else failed += 1;
        }
      });
    }

    return {
      // A run that did nothing says so, rather than looking like a run that
      // was never scheduled.
      summary:
        built + failed + requeued === 0
          ? 'nothing queued'
          : `built ${built}, failed ${failed}, requeued ${requeued}`,
      built,
      failed,
      requeued,
    };
  }

  /**
   * Take the bytes of anything past its date, and keep the row.
   *
   * At 03:50, after the other nightly work: the file is a convenience, the
   * record that somebody produced it is not.
   */
  @Cron('0 50 3 * * *', { name: REPORTS_RETENTION, timeZone: 'Asia/Kolkata' })
  retention(): Promise<void> {
    return this.runner.run(REPORTS_RETENTION, () => this.expireEverywhere());
  }

  async expireEverywhere(): Promise<JobDetail> {
    let expired = 0;
    let filesRemoved = 0;

    for (const tenant of await this.activeTenants()) {
      const context = await this.registry.byIdOrThrow(tenant.id);
      const result = await runInTenant(context, () => this.reports.expire());
      expired += result.expired;
      filesRemoved += result.filesRemoved;
    }

    return {
      summary: expired ? `expired ${expired}, removed ${filesRemoved} file(s)` : 'nothing to expire',
      expired,
      filesRemoved,
    };
  }

  /**
   * Every tenant, not the first one.
   *
   * The ledger reconcile shipped reading `tenants[0]` and reported nothing for
   * months because the first row was the wrong workspace. One tenant is never
   * the answer to "which tenants".
   */
  private activeTenants() {
    return this.prisma.platform.tenant.findMany({
      where: { status: { not: TenantStatus.SUSPENDED } },
      select: { id: true, slug: true },
    });
  }
}

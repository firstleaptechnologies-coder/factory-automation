import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DisbursementStatus, TenantStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantRegistryService } from '../../common/tenancy/tenant-registry.service';
import { runInTenant } from '../../common/tenancy/tenant-context';
import { JobDetail, JobRunnerService } from '../../common/jobs/job-runner.service';
import { LedgerService } from './ledger.service';
import { depositPosting, disbursementPosting, paymentPosting } from './postings';

export const LEDGER_RECONCILE = 'ledger.reconcile';

/** How many rows one workspace's pass will post before leaving the rest. */
const BATCH = 500;

/**
 * Everything that moved money, in the ledger — including what moved before
 * there was one.
 *
 * Two jobs in one, and deliberately so. On its first run it backfills every
 * receipt, deposit and settled payout the shop already had, which is what makes
 * the ledger the whole truth rather than the truth since Tuesday. On every run
 * after that it should find nothing — so a night that posts anything is a
 * signal that something upstream stopped posting, and the count in the job's
 * own record is where that shows up.
 *
 * Safe to run whenever: a posting is keyed by the row that caused it, so the
 * same source cannot be counted twice.
 */
@Injectable()
export class LedgerReconcileJob {
  private readonly logger = new Logger('Ledger');

  constructor(
    private readonly runner: JobRunnerService,
    private readonly prisma: PrismaService,
    private readonly registry: TenantRegistryService,
    private readonly ledger: LedgerService,
  ) {}

  @Cron('0 20 3 * * *', { name: LEDGER_RECONCILE, timeZone: 'Asia/Kolkata' })
  async nightly(): Promise<void> {
    await this.runner.run(LEDGER_RECONCILE, () => this.reconcile());
  }

  async reconcile(): Promise<JobDetail> {
    const tenants = await this.prisma.platform.tenant.findMany({
      where: { status: { not: TenantStatus.SUSPENDED } },
      select: { id: true, slug: true },
    });

    const posted: Record<string, number> = {};
    for (const tenant of tenants) {
      const context = await this.registry.byIdOrThrow(tenant.id);
      const count = await runInTenant(context, () => this.forOneWorkspace());
      if (count > 0) posted[tenant.slug] = count;
    }

    const total = Object.values(posted).reduce((sum, one) => sum + one, 0);
    if (total > 0) {
      // Expected exactly once, on the first run. Any night after that, this
      // line means something stopped posting when it happened.
      this.logger.warn(`Posted ${total} entries that were missing from the ledger`);
    }
    return { posted: total, byWorkspace: posted };
  }

  /** Post anything in this workspace that has no entry of its own yet. */
  private async forOneWorkspace(): Promise<number> {
    const existing = await this.prisma.ledgerEntry.findMany({
      select: { sourceType: true, sourceId: true },
    });
    const seen = new Set(existing.map((row) => `${row.sourceType}:${row.sourceId}`));
    const missing = (type: string, id: string) => !seen.has(`${type}:${id}`);

    let posted = 0;

    const payments = await this.prisma.payment.findMany({
      take: BATCH,
      include: {
        order: { select: { clientId: true, code: true, client: { select: { gstin: true } } } },
      },
    });
    for (const payment of payments) {
      if (!missing('Payment', payment.id)) continue;
      await this.ledger.write(
        paymentPosting({ ...payment, amount: Number(payment.amount) }, payment.order),
      );
      posted += 1;
    }

    const deposits = await this.prisma.cashDeposit.findMany({
      take: BATCH,
      include: { payment: { select: { orderId: true } } },
    });
    for (const deposit of deposits) {
      if (!missing('CashDeposit', deposit.id)) continue;
      await this.ledger.write(
        depositPosting({ ...deposit, amount: Number(deposit.amount) }, deposit.payment),
      );
      posted += 1;
    }

    const payouts = await this.prisma.disbursement.findMany({
      // A planned payout is an intention; only a settled one has moved money.
      where: { status: DisbursementStatus.PAID },
      take: BATCH,
      include: { category: { select: { name: true } } },
    });
    for (const payout of payouts) {
      if (!missing('Disbursement', payout.id)) continue;
      await this.ledger.write(
        disbursementPosting({ ...payout, amount: Number(payout.amount) }),
      );
      posted += 1;
    }

    return posted;
  }
}

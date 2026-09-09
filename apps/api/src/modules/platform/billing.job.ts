import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JobDetail, JobRunnerService } from '../../common/jobs/job-runner.service';
import { PlatformBillingService } from './billing.service';

export const BILLING_RUN = 'billing.invoice';

/**
 * The morning's bills.
 *
 * Early, and every day rather than monthly: each workspace has its own billing
 * day, so there is no one day of the month when billing happens. A daily pass
 * also catches up anything missed while an instance was down, which is safe
 * because a month can only be billed once per workspace — the database says
 * so, not this code.
 *
 * It writes drafts. Sending them is somebody's decision, taken on the screen:
 * a job that both bills and demands payment is one that can charge a client
 * for a mistake nobody has looked at yet.
 */
@Injectable()
export class BillingJob {
  constructor(
    private readonly runner: JobRunnerService,
    private readonly billing: PlatformBillingService,
  ) {}

  @Cron('0 45 3 * * *', { name: BILLING_RUN, timeZone: 'Asia/Kolkata' })
  async nightly(): Promise<void> {
    await this.runner.run(BILLING_RUN, () => this.run());
  }

  async run(now = new Date()): Promise<JobDetail> {
    const { written, skipped } = await this.billing.runBilling(now);
    return { invoicesWritten: written, workspacesSkipped: skipped };
  }
}

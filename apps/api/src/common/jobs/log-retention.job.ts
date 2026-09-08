import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { JobDetail, JobRunnerService } from './job-runner.service';

export const LOG_RETENTION = 'logs.prune';

/**
 * How long the operational logs are kept.
 *
 * Long enough to see a pattern and to answer a support call about last week;
 * short enough that nobody is storing a year of every request. The audit trail
 * is not touched by this — that is the shop's business record and is kept.
 */
export const KEEP_DAYS = 30;

@Injectable()
export class LogRetentionJob {
  constructor(
    private readonly runner: JobRunnerService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('0 45 3 * * *', { name: LOG_RETENTION, timeZone: 'Asia/Kolkata' })
  async nightly(): Promise<void> {
    await this.runner.run(LOG_RETENTION, () => this.prune());
  }

  async prune(now = new Date()): Promise<JobDetail> {
    const before = new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000);

    const [server, client] = await Promise.all([
      this.prisma.platform.serverLog.deleteMany({ where: { at: { lt: before } } }),
      this.prisma.platform.clientLog.deleteMany({ where: { receivedAt: { lt: before } } }),
    ]);

    return { server: server.count, client: client.count, before: before.toISOString() };
  }
}

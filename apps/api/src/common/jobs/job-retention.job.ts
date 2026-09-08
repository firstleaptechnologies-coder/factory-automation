import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { JobDetail, JobRunnerService } from './job-runner.service';

export const JOB_RETENTION = 'jobs.prune';

/** How much job history is worth keeping. Long enough to see a pattern. */
export const KEEP_DAYS = 90;

/**
 * The job log's own housekeeping.
 *
 * Every scheduled run writes a row, including the skipped ones, which is what
 * makes "did it run" answerable — and what would otherwise grow without end.
 */
@Injectable()
export class JobRetentionJob {
  constructor(
    private readonly runner: JobRunnerService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('0 15 3 * * *', { name: JOB_RETENTION, timeZone: 'Asia/Kolkata' })
  async nightly(): Promise<void> {
    await this.runner.run(JOB_RETENTION, () => this.prune());
  }

  async prune(now = new Date()): Promise<JobDetail> {
    const before = new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.platform.jobRun.deleteMany({
      where: { startedAt: { lt: before } },
    });
    return { removed: count, before: before.toISOString() };
  }
}

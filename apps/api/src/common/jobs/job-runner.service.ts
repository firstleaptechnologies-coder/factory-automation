import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobLeaseService } from './job-lease.service';

/** What a job wants recorded about what it did. */
export type JobDetail = Record<string, unknown> | void;

/** Outcomes a run can end in. SKIPPED is healthy: another process had it. */
export const JOB_OUTCOMES = ['RUNNING', 'OK', 'FAILED', 'SKIPPED'] as const;

/**
 * How every scheduled job runs.
 *
 * Three things every job needs and none of them should write for itself: only
 * one process runs it, the run is recorded whether it worked or not, and a job
 * that throws does not take anything down with it. A cron that quietly stopped
 * running is invisible until someone notices the thing it was for never
 * happened — the JobRun rows are how that is noticed instead.
 */
@Injectable()
export class JobRunnerService {
  private readonly logger = new Logger('Jobs');

  constructor(
    private readonly prisma: PrismaService,
    private readonly leases: JobLeaseService,
  ) {}

  async run(
    name: string,
    work: () => Promise<JobDetail>,
    options: { ttlMs?: number } = {},
  ): Promise<void> {
    const db = this.prisma.platform;
    const startedAt = new Date();
    const started = Date.now();

    let held = false;
    try {
      held = await this.leases.acquire(name, options.ttlMs, startedAt);
    } catch (error) {
      // The lease could not even be read. Say so and stop: running without one
      // is exactly the thing the lease exists to prevent.
      this.logger.error(`${name}: could not take the lease — ${message(error)}`);
      return;
    }

    if (!held) {
      await this.record(name, {
        outcome: 'SKIPPED',
        startedAt,
        finishedAt: new Date(),
        durationMs: 0,
      });
      return;
    }

    const run = await db.jobRun
      .create({ data: { name, startedAt } })
      .catch(() => null);

    try {
      const detail = await work();
      const durationMs = Date.now() - started;
      await this.finish(run?.id, name, {
        outcome: 'OK',
        startedAt,
        finishedAt: new Date(),
        durationMs,
        detail: (detail ?? {}) as object,
      });
      this.logger.log(`${name} ok in ${durationMs}ms`);
    } catch (error) {
      const durationMs = Date.now() - started;
      await this.finish(run?.id, name, {
        outcome: 'FAILED',
        startedAt,
        finishedAt: new Date(),
        durationMs,
        error: message(error),
      });
      // Logged, not rethrown: a failing job must not bring the API down with
      // it, and the row above is what anyone will actually look at.
      this.logger.error(`${name} failed after ${durationMs}ms — ${message(error)}`);
    } finally {
      await this.leases.release(name).catch(() => undefined);
    }
  }

  /** Update the row opened at the start, or write one if that create failed. */
  private async finish(
    id: string | undefined,
    name: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!id) return this.record(name, data);
    await this.prisma.platform.jobRun
      .update({ where: { id }, data })
      .catch(() => undefined);
  }

  private async record(name: string, data: Record<string, unknown>): Promise<void> {
    await this.prisma.platform.jobRun
      .create({ data: { name, ...data } })
      .catch(() => undefined);
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

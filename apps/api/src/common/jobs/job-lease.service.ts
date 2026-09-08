import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * How long a lease is held before another process may take it over.
 *
 * Long enough that a slow job is not overtaken while it is still working, short
 * enough that a process killed mid-job does not block tonight's run as well.
 * A job expected to run longer than this passes its own ttl.
 */
export const LEASE_TTL_MS = 10 * 60 * 1000;

/**
 * Who gets to run a scheduled job.
 *
 * The API is one process today and will be several behind a load balancer. Each
 * of them would wake at 03:30 and run the same job — pruning twice is wasteful,
 * pushing twice is a notification the shop reads as a bug, and closing the day
 * twice is wrong. So a job claims a lease first and only one claim can win.
 *
 * A lease rather than a Postgres advisory lock: advisory locks belong to a
 * connection, and Prisma hands out connections from a pool, so the release could
 * land on a different connection than the one holding it. A row with an expiry
 * has neither problem and survives a restart.
 */
@Injectable()
export class JobLeaseService {
  /** Names this process in the lease row, for the "who is running it" question. */
  readonly holder = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

  constructor(private readonly prisma: PrismaService) {}

  /** True when this process may run the job. */
  async acquire(name: string, ttlMs: number = LEASE_TTL_MS, now = new Date()): Promise<boolean> {
    const expiresAt = new Date(now.getTime() + ttlMs);
    const db = this.prisma.platform;

    /*
     * Take over a lease nobody holds any more.
     *
     * Two processes racing here both wait on the same row; the loser re-checks
     * its `where` once the winner commits and sees an expiry in the future, so
     * exactly one of them comes away with a count of 1.
     */
    const taken = await db.jobLease.updateMany({
      where: { name, expiresAt: { lte: now } },
      data: { holder: this.holder, acquiredAt: now, expiresAt },
    });
    if (taken.count > 0) return true;

    try {
      await db.jobLease.create({
        data: { name, holder: this.holder, acquiredAt: now, expiresAt },
      });
      return true;
    } catch {
      // The row exists and has not expired: someone else is running this.
      return false;
    }
  }

  /** Give the lease back, so a retry does not have to wait out the ttl. */
  async release(name: string, now = new Date()): Promise<void> {
    await this.prisma.platform.jobLease.updateMany({
      // Only the holder may release it — a process that lost the lease to an
      // expiry must not free the one that took over.
      where: { name, holder: this.holder },
      data: { expiresAt: now },
    });
  }
}

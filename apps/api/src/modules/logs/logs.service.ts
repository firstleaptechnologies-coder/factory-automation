import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenant } from '../../common/tenancy/tenant-context';
import { ClientLogBatchDto } from './dto/log.dto';

/** Long enough to see a pattern, short enough that nobody keeps a year of it. */
export const KEEP_DAYS = 30;

/**
 * What the app and the browser saw.
 *
 * A crash on the shop floor is otherwise something somebody has to describe
 * over the phone, from memory, a day later. The clients queue these and send
 * them in batches, so a device that lost the network in a workshop still
 * reports what happened once it is back.
 *
 * Written to the platform database beside the server's own log: this is ours
 * rather than the shop's, and it is only useful read across workspaces.
 */
@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(batch: ClientLogBatchDto, userId?: string): Promise<{ recorded: number }> {
    const tenant = currentTenant();

    const { count } = await this.prisma.platform.clientLog.createMany({
      data: batch.entries.map((entry) => ({
        tenantId: tenant?.tenantId ?? null,
        userId: userId ?? null,
        client: batch.client,
        platform: batch.platform ?? null,
        appVersion: batch.appVersion ?? null,
        level: entry.level,
        message: entry.message,
        context: (entry.context ?? undefined) as never,
        // A device's clock can be wrong; both times are kept so it is obvious
        // when it is.
        at: new Date(entry.at),
      })),
    });

    return { recorded: count };
  }
}

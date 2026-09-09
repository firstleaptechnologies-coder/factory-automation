import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NOTIFICATION_TEMPLATES,
  renderNotification,
  templateFor,
  type NotificationSetting,
} from '@fas/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { tenantId } from '../../common/tenancy/tenant-context';

/** One page of somebody's notifications. Enough to catch up on, not a log. */
const PAGE = 50;

export interface RaiseInput {
  /** What it is about, so tapping it can open the thing itself. */
  entity?: string;
  entityId?: string;
  /** Filled into the template's placeholders. */
  values: Record<string, string | null | undefined>;
  /** Who caused it. They are not told about their own doing. */
  actorId?: string;
}

/**
 * Telling people what happened.
 *
 * The row is the source of truth and a push is only the transport: a phone that
 * was off, a person on leave, an app never installed — the notification is
 * still here when they open the product. Which is why this is worth building
 * before the thing that wakes the phone exists.
 *
 * Who gets one is decided by permission rather than by role name, the same way
 * everything else is: somebody who cannot see payments is not told one was
 * taken.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Raise one. Never throws.
   *
   * A shop must not be unable to move an order because telling somebody about
   * it failed — the move is the point, the notification is the courtesy.
   */
  async raise(key: string, input: RaiseInput): Promise<number> {
    try {
      const template = templateFor(key);
      if (!template) return 0;

      const override = await this.prisma.notificationTemplate.findFirst({ where: { key } });
      if (override && !override.enabled) return 0;

      const recipients = await this.prisma.user.findMany({
        where: {
          isActive: true,
          // Who this is *for*, not who may open the screen.
          roleRef: { permissions: { has: template.permission } },
          ...(input.actorId ? { id: { not: input.actorId } } : {}),
        },
        select: { id: true },
      });
      if (recipients.length === 0) return 0;

      const title = renderNotification(override?.title || template.title, input.values);
      const body = renderNotification(override?.body || template.body, input.values);

      const { count } = await this.prisma.notification.createMany({
        data: recipients.map((user) => ({
          tenantId: tenantId(),
          userId: user.id,
          kind: key,
          // Rendered now and kept: editing the wording later must not rewrite
          // what people were already told.
          title,
          body,
          entity: input.entity,
          entityId: input.entityId,
          actorId: input.actorId,
        })),
      });
      return count;
    } catch (error) {
      this.logger.warn(
        `Could not raise ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  async mine(userId: string, query: { unread?: boolean; before?: string } = {}) {
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(query.unread ? { readAt: null } : {}),
        ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE,
    });

    return {
      items: rows,
      unread: await this.unread(userId),
    };
  }

  unread(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string) {
    // Scoped to the reader: one row per person, so read state is theirs alone.
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('No such notification');
    return { read: 1 };
  }

  async markAllRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: count };
  }

  /** Every trigger the product has, with this shop's wording where they set it. */
  async settings(): Promise<NotificationSetting[]> {
    const overrides = await this.prisma.notificationTemplate.findMany();
    const byKey = new Map(overrides.map((row) => [row.key, row]));

    return NOTIFICATION_TEMPLATES.map((template) => {
      const override = byKey.get(template.key);
      return {
        key: template.key,
        title: override?.title || template.title,
        body: override?.body || template.body,
        enabled: override?.enabled ?? true,
        overridden: Boolean(override && (override.title || override.body)),
      };
    });
  }

  async saveSetting(
    key: string,
    body: { title?: string; body?: string; enabled?: boolean },
  ): Promise<NotificationSetting[]> {
    if (!templateFor(key)) throw new NotFoundException(`No notification called ${key}`);

    const existing = await this.prisma.notificationTemplate.findFirst({ where: { key } });
    const data = {
      // Empty means "use what the product ships with" rather than "say nothing".
      title: body.title?.trim() || null,
      body: body.body?.trim() || null,
      enabled: body.enabled ?? true,
    };

    if (existing) {
      await this.prisma.notificationTemplate.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.notificationTemplate.create({
        data: { tenantId: tenantId(), key, ...data },
      });
    }

    return this.settings();
  }
}

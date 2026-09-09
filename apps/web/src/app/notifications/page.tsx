'use client';

import { useRouter } from 'next/navigation';
import type { AppNotification } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Shell } from '@/components/Shell';
import { Button, Card, EmptyState, Loader, PageHead } from '@/ui';
import { relativeTime } from '@/lib/format';

/** Where a notification takes you, by what it is about. */
const OPENS: Record<string, (id: string) => string> = {
  Order: (id) => `/orders/${id}`,
  Lead: (id) => `/leads/${id}`,
  Estimate: (id) => `/quotes/${id}`,
};

/**
 * What happened while you were not looking.
 *
 * The row is the source of truth rather than a push: whether or not the phone
 * ever buzzed, it is here when somebody opens the product. The same list the
 * app shows, from the same endpoint.
 */
export default function NotificationsPage() {
  const router = useRouter();
  const feed = useApi<{ items: AppNotification[]; unread: number }>(
    () => api.notifications(),
    [],
  );

  const open = (item: AppNotification) => {
    if (!item.readAt) {
      // Optimistic: the click is the reading, and a failed request should not
      // stop the page it was about from opening.
      void api.readNotification(item.id).catch(() => undefined);
    }
    const opens = item.entity ? OPENS[item.entity] : undefined;
    if (opens && item.entityId) router.push(opens(item.entityId));
    else feed.reload();
  };

  const readAll = async () => {
    await api.readAllNotifications().catch(() => undefined);
    feed.reload();
  };

  const items = feed.data?.items ?? [];

  return (
    <Shell>
      <PageHead
        title="Notifications"
        subtitle={
          feed.data ? (feed.data.unread ? `${feed.data.unread} unread` : 'All caught up') : ' '
        }
        action={
          feed.data?.unread ? (
            <Button title="Mark all read" variant="ghost" onClick={readAll} />
          ) : undefined
        }
      />

      {feed.loading && !feed.data ? (
        <Loader />
      ) : items.length === 0 ? (
        <EmptyState
          icon="bell"
          title="Nothing yet"
          message="Moves on your orders and enquiries will show up here."
        />
      ) : (
        <div className="stack-sm">
          {items.map((item) => (
            <Card key={item.id} size="sm" onClick={() => open(item)}>
              <div className="row">
                {/* Unread is a dot rather than a highlighted row: the list is
                    read at a glance, and a wall of colour is not. */}
                <span
                  className="timeline-dot"
                  data-testid={item.readAt ? 'read' : 'unread'}
                  style={{ background: item.readAt ? 'transparent' : 'var(--accent)' }}
                />
                <div style={{ minWidth: 0 }}>
                  <div className="t-small bold">{item.title}</div>
                  <div className="t-tiny muted">{item.body}</div>
                  <div className="t-tiny faint">{relativeTime(item.createdAt)}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Shell>
  );
}

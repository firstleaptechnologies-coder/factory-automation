'use client';

import { useRouter } from 'next/navigation';
import type { Order, Paginated, Workflow } from '@decor/shared';
import { PERMISSIONS } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { Card, EmptyState, Icon, IconName, Loader, Pill, SectionHead } from '@/ui';
import { formatInr, relativeTime } from '@/lib/format';

/** The desk equivalent of the app's home screen. */
export default function HomePage() {
  return (
    <Shell>
      <Dashboard />
    </Shell>
  );
}

function Dashboard() {
  const router = useRouter();
  const { user, can } = useAuth();

  const orders = useApi<Paginated<Order> & { unit: string }>(
    () => api.orders({ limit: 6 }),
    [],
  );
  // The counts ride along with the flow, so the summary costs no extra call.
  const workflow = useApi<Workflow>(() => api.defaultWorkflow(), []);

  const summary = (workflow.data?.statuses ?? [])
    .filter((status) => status.homeCardOrder !== null && status.homeCardOrder !== undefined)
    .sort((a, b) => (a.homeCardOrder ?? 0) - (b.homeCardOrder ?? 0));

  /*
   * The four things somebody opens the app to do, and punching last: it is the
   * one that starts something rather than looks at something, and the thumb
   * lands on the right-hand end.
   */
  const tiles: { label: string; icon: IconName; href: string; permission?: string }[] = [
    { label: 'Quotes', icon: 'tag', href: '/quotes', permission: PERMISSIONS.ESTIMATE_VIEW },
    { label: 'Clients', icon: 'users', href: '/clients', permission: PERMISSIONS.CLIENT_VIEW },
    { label: 'Transactions', icon: 'card', href: '/transactions', permission: PERMISSIONS.CASH_POSITION_VIEW },
    { label: 'Payout', icon: 'arrowUpRight', href: '/disbursements', permission: PERMISSIONS.DISBURSEMENT_VIEW },
    { label: 'Punch', icon: 'plus', href: '/punch', permission: PERMISSIONS.ORDER_PUNCH },
  ];

  const open = orders.data?.meta.total ?? 0;

  return (
    <>
      <Card tone="accent" className="enter">
        <div className="row-between">
          <span className="t-label on-accent" style={{ opacity: 0.75 }}>
            Where the work is
          </span>
          {can(PERMISSIONS.CONFIG_MANAGE) ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm on-accent"
              onClick={() => router.push('/admin/main-card')}>
              Change
            </button>
          ) : null}
        </div>

        {summary.length === 0 ? (
          <p className="t-small on-accent" style={{ opacity: 0.85 }}>
            {can(PERMISSIONS.CONFIG_MANAGE)
              ? 'No stages chosen yet — pick which ones this card counts.'
              : 'No stages are being counted here yet.'}
          </p>
        ) : (
          <div className="stage-summary">
            {summary.map((status) => (
              <button
                key={status.id}
                type="button"
                className="stage-count"
                data-testid={`home-stage-${status.id}`}
                onClick={() => router.push(`/orders?statusId=${status.id}`)}>
                <span className="t-h1 on-accent">{status._count?.ordersAtStatus ?? 0}</span>
                <span className="t-micro on-accent">{status.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="t-small on-accent" style={{ opacity: 0.8, marginTop: 6 }}>
          {open} order{open === 1 ? '' : 's'} on file · {user?.name}
        </div>

        <div className="grid-5" style={{ marginTop: 'var(--s-xl)' }}>
          {tiles
            .filter((tile) => !tile.permission || can(tile.permission))
            .map((tile) => (
              <button
                key={tile.href}
                type="button"
                className="hero-tile"
                onClick={() => router.push(tile.href)}>
                <Icon name={tile.icon} size={20} />
                <span className="t-small bold">{tile.label}</span>
              </button>
            ))}
        </div>
      </Card>

      <SectionHead
        title="Recent orders"
        action={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.push('/orders')}>
            View all
            <Icon name="chevronRight" size={14} />
          </button>
        }
      />

      {orders.loading ? (
        <Loader />
      ) : (orders.data?.data.length ?? 0) === 0 ? (
        <EmptyState
          icon="clipboard"
          title="Nothing punched yet"
          message="Orders you punch will appear here."
        />
      ) : (
        <div className="stack-sm">
          {orders.data?.data.map((order) => (
            <Card
              key={order.id}
              size="sm"
              className="row-card"
              onClick={() => router.push(`/orders/${order.id}`)}>
              <div className="row-between">
                <div style={{ minWidth: 0 }}>
                  <div className="t-h3 truncate">{order.client.name}</div>
                  <div className="t-tiny muted">
                    {order.code} · {order.location} · {relativeTime(order.createdAt)}
                  </div>
                </div>
                <div className="row">
                  {Number(order.grandTotal) > 0 ? (
                    <span className="t-body bold accent">{formatInr(order.grandTotal)}</span>
                  ) : null}
                  <Pill label={order.status.name} color={order.status.color} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

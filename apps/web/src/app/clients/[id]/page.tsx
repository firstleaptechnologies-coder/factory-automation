'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import type { Client, HistoryEntry } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { HistoryTimeline } from '@/components/HistoryTimeline';
import { Shell } from '@/components/Shell';
import { Avatar, Button, Card, EmptyState, Icon, Loader, PageHead, Pill, SectionHead } from '@/ui';
import { formatInr, relativeTime } from '@/lib/format';

export default function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Shell>
      <ClientDetail clientId={id} />
    </Shell>
  );
}

function ClientDetail({ clientId }: { clientId: string }) {
  const router = useRouter();
  /* What has been changed on this, and by whom. */
  const history = useApi<HistoryEntry[]>(
    () => api.history('clients', clientId),
    [clientId],
  );

  const client = useApi<Client & { orders?: any[] }>(() => api.client(clientId), [clientId]);

  if (client.loading) return <Loader />;
  const data = client.data;
  if (!data) return null;

  return (
    <>
      <PageHead
        title={data.name}
        subtitle={[data.code, data.company].filter(Boolean).join(' · ')}
        action={
          <div className="row">
            {/* Opened rather than downloaded: it is HTML laid out for A4, and
                the browser's own print dialogue is what makes it a PDF. */}
            <Button
              title="Statement"
              variant="dark"
              onClick={() => window.open(api.clientStatementUrl(clientId), '_blank')}
            />
            <Button
              title="Firm details"
              variant="dark"
              onClick={() => router.push(`/clients/${clientId}/firm`)}
            />
          </div>
        }
      />

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card tone="accent">
          <div className="row">
            <Avatar name={data.name} size={58} />
            <div>
              <div className="t-h2 on-accent">{data.name}</div>
              {data.company ? (
                <div className="t-small on-accent" style={{ opacity: 0.8 }}>
                  {data.company}
                </div>
              ) : null}
            </div>
          </div>
          <div className="wrap" style={{ marginTop: 'var(--s-lg)' }}>
            {data.phone ? (
              <span className="t-tiny on-accent" style={{ opacity: 0.85 }}>
                <Icon name="phone" size={12} /> {data.phone}
              </span>
            ) : null}
            <span className="t-tiny on-accent" style={{ opacity: 0.85 }}>
              <Icon name="clipboard" size={12} /> {data.orders?.length ?? 0} orders
            </span>
          </div>
        </Card>

        <Card onClick={() => router.push(`/clients/${clientId}/firm`)}>
          <div className="row-between">
            <div>
              <div className="t-label muted">Firm details</div>
              <div className="t-tiny faint">
                {data.gstin
                  ? `GSTIN ${data.gstin}${data.stateName ? ` · ${data.stateName}` : ''}`
                  : 'GST number, addresses and a second contact number'}
              </div>
            </div>
            <Icon name="chevronRight" size={14} color="var(--text-faint)" />
          </div>
          {data.billingAddress ? (
            <p className="t-small muted" style={{ whiteSpace: 'pre-line', marginBottom: 0 }}>
              {data.billingAddress}
            </p>
          ) : null}
        </Card>
      </div>

      {data.locations?.length ? (
        <>
          <SectionHead title="Sites" />
          <div className="wrap">
            {data.locations.map((location) => (
              <span key={location.id} className="chip" style={{ cursor: 'default' }}>
                {location.name}
                {location.useCount ? ` · ${location.useCount}` : ''}
              </span>
            ))}
          </div>
        </>
      ) : null}

      <SectionHead title="Orders" />
      {(data.orders?.length ?? 0) === 0 ? (
        <EmptyState icon="clipboard" title="No orders yet" />
      ) : (
        <div className="stack-sm">
          {data.orders?.map((order: any) => (
            <Card key={order.id} size="sm" onClick={() => router.push(`/orders/${order.id}`)}>
              <div className="row-between">
                <div>
                  <div className="t-body bold">{order.code}</div>
                  <div className="t-tiny muted">
                    {order.location} · {relativeTime(order.createdAt)}
                  </div>
                </div>
                <div className="row">
                  {Number(order.grandTotal) > 0 ? (
                    <span className="t-small bold accent">{formatInr(order.grandTotal)}</span>
                  ) : null}
                  {order.status ? (
                    <Pill label={order.status.name} color={order.status.color} />
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionHead title="History" />
      <Card size="sm">
        <HistoryTimeline entries={history.data ?? []} empty="Nothing has changed since this client was added" />
      </Card>
    </>
  );
}

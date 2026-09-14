'use client';

import { useRouter } from 'next/navigation';
import type { Outstanding } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Shell } from '@/components/Shell';
import { Avatar, Card, EmptyState, Loader, PageHead } from '@/ui';
import { formatInr } from '@/lib/format';

export default function OutstandingPage() {
  return (
    <Shell>
      <Owed />
    </Shell>
  );
}

/**
 * What the shop is owed, and by whom.
 *
 * It was on no screen. The owner who trialled this worked it out on paper —
 * 43,200 + 16,200 + 25,000 — and said that until a screen showed it he would
 * not trust the rest of the numbers. It is also the page to open before
 * ringing somebody, so the list is by person rather than by order and the
 * biggest debt is at the top.
 */
function Owed() {
  const router = useRouter();
  const owed = useApi<Outstanding>(() => api.outstanding(), []);

  if (owed.loading && !owed.data) return <Loader label="Loading" />;
  const data = owed.data;
  if (!data) return null;

  return (
    <>
      <PageHead
        title="Owed to you"
        subtitle={data.orders === 1 ? 'across 1 order' : `across ${data.orders} orders`}
      />

      <Card tone="accent" className="enter">
        <span className="t-label on-accent" style={{ opacity: 0.75 }}>
          Still to collect
        </span>
        <div className="t-display on-accent">{formatInr(data.owed)}</div>
        {/*
          Never netted against what is owed. A shop short on one order and
          holding too much on another is owed the first and holding the second;
          one figure would report the debt as smaller than it is.
        */}
        {data.held > 0 ? (
          <div className="t-small on-accent" style={{ opacity: 0.85 }} data-testid="held">
            Separately, {formatInr(data.held)} taken against orders that came to less.
          </div>
        ) : null}
      </Card>

      {data.clients.length === 0 ? (
        <EmptyState
          icon="check"
          title="Nothing outstanding"
          message="Every order that has been priced has been paid for."
        />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Orders</th>
                <th className="num">Owed</th>
              </tr>
            </thead>
            <tbody>
              {data.clients.map((client) => (
                <tr
                  key={client.clientId}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/clients/${client.clientId}`)}>
                  <td>
                    <span className="row" style={{ alignItems: 'center', gap: 10 }}>
                      <Avatar name={client.name} size={30} />
                      <span>
                        <strong>{client.name}</strong>
                        <span className="t-tiny muted" style={{ display: 'block' }}>
                          {client.code}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="muted">
                    {client.orders === 1 ? '1 order' : `${client.orders} orders`}
                  </td>
                  <td className="num bold warning">{formatInr(client.owed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

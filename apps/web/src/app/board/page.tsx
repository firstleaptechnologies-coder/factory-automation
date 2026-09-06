'use client';

import Link from 'next/link';
import type { OrderBoard } from '@decor/shared';
import { UNIT_LABEL } from '@decor/shared';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';

/** Orders grouped under the statuses the admin configured. */
export default function BoardPage() {
  const { data, error, loading, reload } = useApi<OrderBoard>(() => api.orderBoard());

  return (
    <Shell>
      <h1 className="page-title">Board</h1>
      <p className="page-sub">{data?.workflow.name ?? 'Loading…'}</p>

      {error ? <div className="banner danger">{error}</div> : null}

      {loading || !data ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="scroll-x">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingBottom: 8 }}>
            {data.columns.map((column) => (
              <div
                key={column.status.id}
                className="card"
                style={{ minWidth: 260, borderTop: `3px solid ${column.status.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{column.status.name}</strong>
                  <span className="muted">{column.orders.length}</span>
                </div>

                {column.orders.length === 0 ? (
                  <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Empty</p>
                ) : (
                  column.orders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/orders/${order.id}`}
                      style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
                      <div
                        style={{
                          background: 'var(--surface-alt)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: 10,
                          marginTop: 10,
                        }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{order.code}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{order.client.name}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{order.location}</div>
                        {order.items[0]?.display ? (
                          <div style={{ fontSize: 12, marginTop: 4 }}>
                            {order.items[0].display.length} × {order.items[0].display.width}{' '}
                            {UNIT_LABEL[order.items[0].display.unit]}
                            {order.items.length > 1 ? ` +${order.items.length - 1}` : ''}
                          </div>
                        ) : null}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <button style={{ marginTop: 14 }} onClick={reload}>Refresh</button>
    </Shell>
  );
}

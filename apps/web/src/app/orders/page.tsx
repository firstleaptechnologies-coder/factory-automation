'use client';

import {useState} from 'react';
import {formatCurrency, formatDate, daysUntil} from '@decor/shared';
import {Shell} from '@/components/Shell';
import {Pill, ErrorBox} from '@/components/bits';
import {api} from '@/lib/api';
import {useApi} from '@/lib/useApi';

export default function OrdersPage() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const {data, error, loading, reload} = useApi(
    () => api.orders({status: status || undefined, search: search || undefined, limit: 50}),
    [status, search],
  );

  return (
    <Shell>
      <h1 className="page-title">Orders</h1>
      <p className="page-sub">Customer orders and their production status.</p>

      <div className="row" style={{marginBottom: 14}}>
        <div style={{width: 220}}>
          <label htmlFor="status">Status</label>
          <select id="status" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All</option>
            {['DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'].map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div style={{width: 260}}>
          <label htmlFor="search">Search</label>
          <input
            id="search"
            placeholder="Order no, PO or customer"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button onClick={reload}>Refresh</button>
      </div>

      <ErrorBox message={error} />

      <div className="card scroll-x">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>PO</th>
                <th>Status</th>
                <th>Due</th>
                <th className="num">Lines</th>
                <th className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map(order => {
                const days = daysUntil(order.dueDate);
                const overdue =
                  days !== null && days < 0 && !['DELIVERED', 'CANCELLED'].includes(order.status);
                return (
                  <tr key={order.id}>
                    <td><strong>{order.code}</strong></td>
                    <td>{order.customer?.name}</td>
                    <td className="muted">{order.poNumber ?? '—'}</td>
                    <td><Pill status={order.status} /></td>
                    <td style={overdue ? {color: 'var(--danger)', fontWeight: 600} : undefined}>
                      {formatDate(order.dueDate)}
                      {overdue ? ` (${Math.abs(days!)}d late)` : ''}
                    </td>
                    <td className="num">{order._count?.items ?? order.items?.length ?? 0}</td>
                    <td className="num">{formatCurrency(order.total)}</td>
                  </tr>
                );
              })}
              {data && data.data.length === 0 ? (
                <tr><td colSpan={7} className="muted">No orders found.</td></tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}

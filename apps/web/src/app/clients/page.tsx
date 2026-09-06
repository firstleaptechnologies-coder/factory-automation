'use client';

import { useState } from 'react';
import type { Client, Paginated } from '@decor/shared';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';

export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const { data, error, loading } = useApi<Paginated<Client>>(
    () => api.clients({ search: search || undefined, limit: 100 }),
    [search],
  );

  return (
    <Shell>
      <h1 className="page-title">Clients</h1>
      <p className="page-sub">Added automatically as orders are punched.</p>

      <div className="row" style={{ marginBottom: 14 }}>
        <div style={{ width: 280 }}>
          <label htmlFor="search">Search</label>
          <input
            id="search"
            placeholder="Name, phone or code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error ? <div className="banner danger">{error}</div> : null}

      <div className="card scroll-x">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <thead>
              <tr><th>Code</th><th>Name</th><th>Company</th><th>Phone</th><th className="num">Orders</th></tr>
            </thead>
            <tbody>
              {data?.data.map((client) => (
                <tr key={client.id}>
                  <td className="muted">{client.code}</td>
                  <td><strong>{client.name}</strong></td>
                  <td className="muted">{client.company ?? '—'}</td>
                  <td>{client.phone ?? '—'}</td>
                  <td className="num">{client._count?.orders ?? 0}</td>
                </tr>
              ))}
              {data?.data.length === 0 ? (
                <tr><td colSpan={5} className="muted">No clients yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}

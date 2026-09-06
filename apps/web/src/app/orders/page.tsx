'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Material, Order, Workflow } from '@decor/shared';
import { DEFAULT_UNIT, LENGTH_UNITS, LengthUnit, UNIT_LABEL, formatLength } from '@decor/shared';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);

  const [unit, setUnit] = useState<LengthUnit>(DEFAULT_UNIT);
  const [search, setSearch] = useState('');
  const [statusId, setStatusId] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.materials(), api.defaultWorkflow()])
      .then(([m, w]) => { setMaterials(m); setWorkflow(w); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .orders({
          unit,
          search: search || undefined,
          statusId: statusId || undefined,
          materialId: materialId || undefined,
          limit: 50,
        })
        .then((result) => { setOrders(result.data); setError(null); })
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not load orders'))
        .finally(() => setLoading(false));
    }, 180);
    return () => clearTimeout(timer);
  }, [unit, search, statusId, materialId]);

  return (
    <Shell>
      <h1 className="page-title">Orders</h1>
      <p className="page-sub">
        Sizes are stored in millimetres and shown in whichever unit you pick.
      </p>

      <div className="row" style={{ marginBottom: 14 }}>
        <div style={{ width: 240 }}>
          <label htmlFor="search">Search</label>
          <input
            id="search"
            placeholder="Order no, client or location"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ width: 190 }}>
          <label htmlFor="status">Status</label>
          <select id="status" value={statusId} onChange={(e) => setStatusId(e.target.value)}>
            <option value="">All</option>
            {workflow?.statuses.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div style={{ width: 190 }}>
          <label htmlFor="material">Material</label>
          <select id="material" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
            <option value="">All</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Show sizes in</label>
          <div className="unit-toggle">
            {LENGTH_UNITS.map((u) => (
              <button
                key={u}
                type="button"
                className={unit === u ? 'active' : ''}
                onClick={() => setUnit(u)}>
                {UNIT_LABEL[u]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? <div className="banner danger">{error}</div> : null}

      <div className="card scroll-x">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Client</th>
                <th>Location</th>
                <th>Items</th>
                <th>Status</th>
                <th>Punched</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/orders/${order.id}`}><strong>{order.code}</strong></Link>
                    {order.priority !== 'NORMAL' ? (
                      <div className="muted" style={{ fontSize: 11 }}>{order.priority}</div>
                    ) : null}
                  </td>
                  <td>{order.client.name}</td>
                  <td className="muted">{order.location}</td>
                  <td>
                    {order.items.map((item) => (
                      <div key={item.id} style={{ fontSize: 13 }}>
                        {item.display
                          ? `${item.display.length} × ${item.display.width} ${UNIT_LABEL[item.display.unit]}`
                          : '—'}
                        {item.display?.thickness
                          ? ` · ${item.display.thickness} ${UNIT_LABEL[item.display.thicknessUnit]}`
                          : ''}
                        <span className="muted"> · {item.material.name} × {item.quantity}</span>
                      </div>
                    ))}
                  </td>
                  <td>
                    <span className="pill" style={{ background: order.status.color }}>
                      {order.status.name}
                    </span>
                  </td>
                  <td className="muted">
                    {new Date(order.createdAt).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short',
                    })}
                  </td>
                </tr>
              ))}
              {orders.length === 0 ? (
                <tr><td colSpan={6} className="muted">No orders match.</td></tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}

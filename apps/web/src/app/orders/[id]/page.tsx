'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Order, WorkflowStatus, WorkflowTransition } from '@decor/shared';
import { DEFAULT_UNIT, LENGTH_UNITS, LengthUnit, UNIT_LABEL, formatBytes } from '@decor/shared';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

type NextMove = WorkflowTransition & { toStatus: WorkflowStatus };

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [moves, setMoves] = useState<NextMove[]>([]);
  const [unit, setUnit] = useState<LengthUnit>(DEFAULT_UNIT);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const fresh = await api.order(params.id, unit);
    setOrder(fresh);
    setMoves(await api.allowedNext(fresh.status.id));
  }, [params.id, unit]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Could not load the order'));
  }, [load]);

  const move = async (target: NextMove) => {
    setBusy(true);
    setError(null);
    try {
      await api.changeOrderStatus(params.id, { toStatusId: target.toStatusId, note: note || undefined });
      setNote('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the status');
    } finally {
      setBusy(false);
    }
  };

  if (!order) {
    return (
      <Shell>
        {error ? <div className="banner danger">{error}</div> : <p className="muted">Loading…</p>}
      </Shell>
    );
  }

  const references = order.attachments.filter((a) => a.kind === 'REFERENCE_IMAGE');
  const sizeImages = order.attachments.filter((a) => a.kind === 'SIZE_IMAGE');

  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{order.code}</h1>
        <span className="pill" style={{ background: order.status.color }}>{order.status.name}</span>
      </div>
      <p className="page-sub">
        {order.client.name} · {order.location}
        {order.client.phone ? ` · ${order.client.phone}` : ''}
      </p>

      {error ? <div className="banner danger">{error}</div> : null}

      <div className="grid cols-2">
        <div className="card">
          <div className="toolbar">
            <h3 style={{ margin: 0 }}>Items</h3>
            <div className="spacer" />
            <div className="unit-toggle">
              {LENGTH_UNITS.map((u) => (
                <button key={u} className={unit === u ? 'active' : ''} onClick={() => setUnit(u)}>
                  {UNIT_LABEL[u]}
                </button>
              ))}
            </div>
          </div>
          <table>
            <thead>
              <tr><th>#</th><th>Size</th><th>Material</th><th>Thickness</th><th className="num">Qty</th></tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.lineNo}</td>
                  <td>
                    <strong>
                      {item.display
                        ? `${item.display.length} × ${item.display.width} ${UNIT_LABEL[item.display.unit]}`
                        : '—'}
                    </strong>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {Number(item.lengthMm)} × {Number(item.widthMm)} mm stored
                    </div>
                    {item.notes ? <div className="muted" style={{ fontSize: 12 }}>{item.notes}</div> : null}
                  </td>
                  <td>{item.material.name}</td>
                  <td>
                    {item.display?.thickness
                      ? `${item.display.thickness} ${UNIT_LABEL[item.display.thicknessUnit]}`
                      : '—'}
                  </td>
                  <td className="num">{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Move to</h3>
          {moves.length === 0 ? (
            <p className="muted">
              No moves are allowed from {order.status.name}. An admin can add one on the status flow.
            </p>
          ) : (
            <>
              {moves.some((m) => m.requiresNote) ? (
                <div className="field">
                  <label htmlFor="note">Note</label>
                  <input
                    id="note"
                    placeholder="Required for some moves"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {moves.map((m) => (
                  <button
                    key={m.id}
                    disabled={busy}
                    onClick={() => move(m)}
                    style={{ borderColor: m.toStatus.color }}>
                    {m.label ?? m.toStatus.name}
                    {m.requiresNote ? ' *' : ''}
                  </button>
                ))}
              </div>
            </>
          )}

          <h3 style={{ marginTop: 20 }}>History</h3>
          <table>
            <tbody>
              {order.statusHistory?.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ width: 120 }} className="muted">
                    {new Date(entry.changedAt).toLocaleString('en-IN', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td>
                    {entry.fromStatus ? `${entry.fromStatus.name} → ` : ''}
                    <strong>{entry.toStatus.name}</strong>
                    {entry.note ? <div className="muted" style={{ fontSize: 12 }}>{entry.note}</div> : null}
                  </td>
                  <td className="muted">{entry.changedBy?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Reference images</h3>
          {references.length === 0 ? (
            <p className="muted">None attached.</p>
          ) : (
            <div className="thumb-grid">
              {references.map((attachment) => (
                <a
                  key={attachment.id}
                  className="thumb"
                  href={api.fileUrl(attachment.file.id)}
                  target="_blank"
                  rel="noreferrer">
                  {/* Served through the authenticated API, not a public URL. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={api.fileUrl(attachment.file.id)} alt={attachment.description ?? ''} />
                  <div className="meta">
                    {attachment.description}
                    <div>
                      {attachment.file.originalByteSize
                        ? `${formatBytes(attachment.file.originalByteSize)} → `
                        : ''}
                      {formatBytes(attachment.file.byteSize)}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Size image</h3>
          {sizeImages.length === 0 ? (
            <p className="muted">None attached.</p>
          ) : (
            <div className="thumb-grid">
              {sizeImages.map((attachment) => (
                <a
                  key={attachment.id}
                  className="thumb"
                  href={api.fileUrl(attachment.file.id)}
                  target="_blank"
                  rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={api.fileUrl(attachment.file.id)} alt="Size drawing" />
                  <div className="meta">
                    {attachment.file.width}×{attachment.file.height} ·{' '}
                    {formatBytes(attachment.file.byteSize)}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

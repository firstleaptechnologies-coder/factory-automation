'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Order, OrderBoard } from '@decor/shared';
import { PERMISSIONS, UNIT_LABEL } from '@decor/shared';
import { Shell } from '@/components/Shell';
import { KanbanBoard } from '@/components/KanbanBoard';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Orders grouped by status. Drag a card to move it along the flow. */
export default function BoardPage() {
  const router = useRouter();
  const { can } = useAuth();
  const [board, setBoard] = useState<OrderBoard | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'success' | 'danger' } | null>(null);

  const load = useCallback(async () => {
    setBoard(await api.orderBoard());
  }, []);

  useEffect(() => {
    load().catch((e) =>
      setMessage({ text: e instanceof Error ? e.message : 'Could not load', tone: 'danger' }),
    );
  }, [load]);

  const move = async (order: Order, toStatusId: string) => {
    setMessage(null);
    const target = board?.columns.find((c) => c.status.id === toStatusId)?.status;

    // The server refuses a move that requires a note without one, so ask first
    // rather than letting the drop fail and having to explain afterwards.
    const transitions = await api.allowedNext(order.status.id);
    const transition = transitions.find((t) => t.toStatusId === toStatusId);

    let note: string | undefined;
    if (transition?.requiresNote) {
      const entered = window.prompt(
        `Moving ${order.code} to ${target?.name} needs a note. Why?`,
      );
      if (!entered?.trim()) {
        setMessage({ text: 'Move cancelled — a note is required.', tone: 'danger' });
        return;
      }
      note = entered.trim();
    }

    /*
     * A card dragged backwards.
     *
     * The flow is one-way, so this drop has no arrow behind it — but work does
     * go backwards, and refusing it outright meant the only way to record that
     * was to draw a permanent backwards arrow anybody could then take by
     * accident. Offered only to somebody allowed to make it, and only where
     * the arrow exists the other way round, and never without the question.
     */
    let reverse = false;
    let name = target?.name;
    if (!transition && can(PERMISSIONS.ORDER_MOVE_BACK)) {
      const back = await api.allowedBack(order.status.id);
      const step = back.find((one) => one.toStatus.id === toStatusId);
      if (step) {
        // Named from the flow rather than from the board: a column the board
        // is not showing is still somewhere an order can be sent back to.
        name = step.toStatus.name;
        const asked = window.confirm(
          `${order.status.name} → ${name} is not a step this flow draws. ` +
            `${order.code} would go back a stage, recorded as a reversal with your name on it. Are you sure?`,
        );
        if (!asked) {
          await load();
          return;
        }
        reverse = true;
        note =
          window.prompt(`Why is ${order.code} going back?`)?.trim() || undefined;
      }
    }

    try {
      await api.changeOrderStatus(order.id, { toStatusId, note, ...(reverse ? { reverse } : {}) });
      await load();
      setMessage({
        text: reverse
          ? `${order.code} was sent back to ${name}.`
          : `${order.code} moved to ${name}.`,
        tone: 'success',
      });
    } catch (e) {
      // Reload so the card snaps back to where it actually is.
      await load();
      setMessage({
        text: e instanceof Error ? e.message : 'Could not move the order',
        tone: 'danger',
      });
    }
  };

  return (
    <Shell>
      <div className="legacy">
      <h1 className="page-title">Board</h1>
      <p className="page-sub">
        {board?.workflow.name ?? 'Loading…'} — drag a card to move it. Moves the flow
        does not allow are refused.
      </p>

      {message ? <div className={`banner ${message.tone}`}>{message.text}</div> : null}

      {!board ? (
        <p className="muted">Loading…</p>
      ) : (
        <KanbanBoard
          columns={board.columns.map((column) => ({
            status: column.status,
            items: column.orders,
          }))}
          onMove={move}
          renderCard={(order) => (
            <div onDoubleClick={() => router.push(`/orders/${order.id}`)}>
              <div className="code">{order.code}</div>
              <div className="sub">{order.client.name}</div>
              <div className="sub">{order.location}</div>
              {order.items[0]?.display ? (
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  {order.items[0].display.length} × {order.items[0].display.width}{' '}
                  {UNIT_LABEL[order.items[0].display.unit]}
                  {order.items.length > 1 ? ` +${order.items.length - 1}` : ''}
                </div>
              ) : null}
              {order.priority !== 'NORMAL' ? (
                <div className="sub" style={{ color: 'var(--warning)' }}>{order.priority}</div>
              ) : null}
            </div>
          )}
        />
      )}

      <p className="muted" style={{ fontSize: 12 }}>Double-click a card to open it.</p>
    </div>
    </Shell>
  );
}

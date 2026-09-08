'use client';

import { useState } from 'react';
import type { WorkflowStatus } from '@decor/shared';

export interface KanbanColumn<T> {
  status: WorkflowStatus;
  items: T[];
  subtitle?: string;
}

/**
 * Drag-and-drop board shared by orders and leads.
 *
 * A card is dropped on a column and the move goes to the server, which checks
 * it against the graph the admin drew. The UI does not pre-filter drop targets:
 * the server owns that rule, and duplicating it here would let the two drift
 * apart. What the UI does instead is put the card back and say why when the
 * move is refused — an optimistic move that silently reverts is worse than no
 * optimism at all.
 */
export function KanbanBoard<T extends { id: string }>({
  columns,
  renderCard,
  onMove,
  emptyLabel = 'Empty',
}: {
  columns: KanbanColumn<T>[];
  renderCard: (item: T) => React.ReactNode;
  onMove: (item: T, toStatusId: string) => Promise<void>;
  emptyLabel?: string;
}) {
  const [dragging, setDragging] = useState<{ item: T; fromStatusId: string } | null>(null);
  const [hoverColumn, setHoverColumn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const drop = async (toStatusId: string) => {
    setHoverColumn(null);
    if (!dragging || busy) return;
    if (dragging.fromStatusId === toStatusId) {
      setDragging(null);
      return;
    }

    setBusy(true);
    try {
      await onMove(dragging.item, toStatusId);
    } finally {
      setBusy(false);
      setDragging(null);
    }
  };

  return (
    <div className="scroll-x">
      <div className="kanban">
        {columns.map((column) => (
          <div
            key={column.status.id}
            className={`kanban-col${hoverColumn === column.status.id ? ' over' : ''}`}
            style={{ '--column-accent': column.status.color } as React.CSSProperties}
            onDragOver={(event) => {
              // Without preventDefault the browser refuses the drop entirely.
              event.preventDefault();
              setHoverColumn(column.status.id);
            }}
            onDragLeave={() => setHoverColumn((c) => (c === column.status.id ? null : c))}
            onDrop={(event) => {
              event.preventDefault();
              void drop(column.status.id);
            }}>
            <div className="kanban-head" style={{ borderTopColor: column.status.color }}>
              <strong>{column.status.name}</strong>
              <span className="muted">{column.items.length}</span>
            </div>
            {column.subtitle ? (
              <div className="muted" style={{ fontSize: 11 }}>{column.subtitle}</div>
            ) : null}

            <div className="kanban-body">
              {column.items.length === 0 ? (
                <p className="muted" style={{ fontSize: 12 }}>{emptyLabel}</p>
              ) : (
                column.items.map((item) => (
                  <div
                    key={item.id}
                    className={`kanban-card${dragging?.item.id === item.id ? ' dragging' : ''}`}
                    draggable
                    onDragStart={() =>
                      setDragging({ item, fromStatusId: column.status.id })
                    }
                    onDragEnd={() => {
                      setDragging(null);
                      setHoverColumn(null);
                    }}>
                    {renderCard(item)}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

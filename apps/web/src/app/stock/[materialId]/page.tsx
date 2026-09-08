'use client';

import { use, useState } from 'react';
import type { StockLevels, StockMove, StockMoveKind } from '@decor/shared';
import {
  PERMISSIONS,
  RECORDABLE_MOVES,
  STOCK_MOVE_LABELS,
  today,
} from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { Button, Card, EmptyState, Field, Loader, PageHead, Sheet } from '@/ui';
import { Select } from '@/ui/Select';
import { formatDateShort } from '@/lib/format';

/** Which kinds a person has to explain. */
const NEEDS_A_REASON: StockMoveKind[] = ['WASTE', 'ADJUSTMENT'];

export default function StockMovesPage({
  params,
}: {
  params: Promise<{ materialId: string }>;
}) {
  const { materialId } = use(params);
  return (
    <Shell>
      <Moves materialId={materialId} />
    </Shell>
  );
}

/**
 * Everything that ever happened to one material.
 *
 * A delivery cannot be recorded here — stock arrives against a purchase, so
 * that everything on the rack has a bill behind it. What can be recorded is
 * what became of it afterwards.
 */
function Moves({ materialId }: { materialId: string }) {
  const { can } = useAuth();
  const moves = useApi<StockMove[]>(() => api.stockMoves(materialId), [materialId]);
  const level = useApi<StockLevels>(() => api.stockLevels({ materialId }), [materialId]);

  const [sheet, setSheet] = useState(false);
  const [kind, setKind] = useState<StockMoveKind>('CONSUMPTION');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [at, setAt] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canMove = can(PERMISSIONS.STOCK_MOVE);
  const row = level.data?.rows[0];
  const needsReason = NEEDS_A_REASON.includes(kind);

  return (
    <>
      <PageHead
        title={row?.material.name ?? 'Material'}
        subtitle={
          row
            ? `${row.quantity} ${row.material.stockUnit} on the rack`
            : 'The story of the rack'
        }
        action={
          canMove ? (
            <Button title="Record a move" icon="plus" onClick={() => setSheet(true)} />
          ) : null
        }
      />

      {moves.loading ? (
        <Loader />
      ) : (moves.data ?? []).length === 0 ? (
        <EmptyState title="Nothing has moved yet" />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>What happened</th>
                <th className="num">How many</th>
                <th>When</th>
                <th>Why</th>
                <th>Who</th>
              </tr>
            </thead>
            <tbody>
              {(moves.data ?? []).map((move) => (
                <tr key={move.id}>
                  <td className="bold">
                    {STOCK_MOVE_LABELS[move.kind]}
                    {move.order ? <div className="t-tiny faint">{move.order.code}</div> : null}
                  </td>
                  <td className="num">
                    {Number(move.quantity) > 0 ? '+' : ''}
                    {move.quantity} {move.unit}
                  </td>
                  <td className="muted">{formatDateShort(move.at)}</td>
                  <td className="muted t-tiny">{move.reason ?? '—'}</td>
                  <td className="muted t-tiny">{move.recordedBy?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Sheet
        open={sheet}
        title="Record a move"
        subtitle="A delivery arrives against a purchase, not here"
        onClose={() => setSheet(false)}>
        <Select
          label="What happened"
          value={kind}
          options={RECORDABLE_MOVES.map((one) => ({
            value: one,
            label: STOCK_MOVE_LABELS[one],
          }))}
          onChange={(value) => setKind(value as StockMoveKind)}
        />
        <Field label="How many" value={quantity} onChange={setQuantity} />
        <Field
          label={needsReason ? 'Why (required)' : 'Why'}
          placeholder="Board split on the saw"
          value={reason}
          onChange={setReason}
        />
        <Field label="When" type="date" value={at} onChange={setAt} />
        {error ? (
          <div className="t-small" style={{ color: 'var(--danger)', marginBottom: 'var(--s-md)' }}>
            {error}
          </div>
        ) : null}
        <Button
          title="Record it"
          block
          loading={busy}
          disabled={!Number(quantity) || (needsReason && reason.trim().length < 3)}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api.recordStockMove({
                materialId,
                kind,
                quantity: Number(quantity),
                reason: reason.trim() || undefined,
                at,
              });
              setSheet(false);
              setQuantity('');
              setReason('');
              moves.reload();
              level.reload();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Unknown error');
            } finally {
              setBusy(false);
            }
          }}
        />
      </Sheet>
    </>
  );
}

'use client';

import { use, useState } from 'react';
import type {
  Disbursement,
  DisbursementCategory,
  DisbursementSummary,
  PaymentMode,
} from '@fas/shared';
import { PERMISSIONS } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Loader,
  PageHead,
  Pill,
  SectionHead,
  Sheet,
} from '@/ui';
import { formatDateShort, formatInr } from '@/lib/format';

export default function OrderDisbursementsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Shell>
      <OrderDisbursements orderId={id} />
    </Shell>
  );
}

/**
 * What one order still owes other people.
 *
 * This ledger sits beside the order, never inside it. The order is worth what
 * it was quoted at and is settled when that much has been collected; what the
 * shop then pays a fitter or a transporter out of it is a separate obligation.
 */
function OrderDisbursements({ orderId }: { orderId: string }) {
  const { can } = useAuth();
  const ledger = useApi<DisbursementSummary>(
    () => api.orderDisbursements(orderId),
    [orderId],
  );
  const categories = useApi<DisbursementCategory[]>(() => api.disbursementCategories(), []);

  const [sheet, setSheet] = useState(false);
  const [payeeName, setPayeeName] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [note, setNote] = useState('');
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [mode, setMode] = useState<PaymentMode>('CASH');

  const [settling, setSettling] = useState<Disbursement | null>(null);
  const [settleMode, setSettleMode] = useState<PaymentMode>('CASH');
  const [settleRef, setSettleRef] = useState('');

  const [busy, setBusy] = useState(false);
  const [taking, setTaking] = useState<Disbursement | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canManage = can(PERMISSIONS.DISBURSEMENT_MANAGE);

  /*
   * Closing a money sheet forgets what was in it — the same reason the payment
   * sheet does. A refused figure still sitting there with the cursor behind it
   * is how ₹99,999 and ₹23,200 became 9999923200. The reason for taking a
   * payout back matters the same way: it is the only record of why.
   */
  const closeAdd = () => {
    setSheet(false);
    setPayeeName('');
    setAmount('');
    setNote('');
    setAlreadyPaid(false);
  };

  const closeSettle = () => {
    setSettling(null);
    setSettleRef('');
  };

  const closeTakeBack = () => {
    setTaking(null);
    setReason('');
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createDisbursement(orderId, {
        payeeName: payeeName.trim(),
        amount: Number(amount),
        categoryId,
        note: note.trim() || undefined,
        status: alreadyPaid ? 'PAID' : 'PLANNED',
        paidMode: alreadyPaid ? mode : undefined,
      });
      closeAdd();
      ledger.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add');
    } finally {
      setBusy(false);
    }
  };

  if (ledger.loading) return <Loader label="Loading" />;
  const data = ledger.data;
  if (!data) return null;

  return (
    <>
      <PageHead
        title={data.label}
        subtitle="Paid out of this order, after the client has paid"
        action={
          canManage ? (
            <Button title={`Add ${data.label}`} icon="plus" onClick={() => setSheet(true)} />
          ) : null
        }
      />

      <Card tone="accent" className="enter">
        <span className="t-label on-accent" style={{ opacity: 0.75 }}>
          Committed
        </span>
        <div className="t-display on-accent">{formatInr(data.total)}</div>
        <div className="row-between" style={{ marginTop: 'var(--s-lg)' }}>
          <div>
            <div className="t-tiny on-accent" style={{ opacity: 0.75 }}>
              Paid out
            </div>
            <div className="t-h3 on-accent">{formatInr(data.paid)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="t-tiny on-accent" style={{ opacity: 0.75 }}>
              Still owed
            </div>
            <div className="t-h3 on-accent">{formatInr(data.pending)}</div>
          </div>
        </div>
      </Card>

      <p className="t-tiny faint" style={{ marginTop: 'var(--s-md)' }}>
        Separate from the order. The order&apos;s own total and payment status are
        unchanged by anything on this screen.
      </p>

      <SectionHead
        title={
          data.count === 0 ? 'Payouts' : `${data.count} payout${data.count === 1 ? '' : 's'}`
        }
      />

      {data.disbursements.length === 0 ? (
        <EmptyState title="Nothing to pay out yet" />
      ) : (
        <div className="stack-sm">
          {data.disbursements.map((row) => (
            <Card key={row.id} size="sm">
              <div className="row-between">
                <div style={{ minWidth: 0 }}>
                  <div className="t-h3 truncate">{row.payeeName}</div>
                  <div className="t-tiny muted">
                    {row.category?.name ?? 'Uncategorised'}
                    {row.paidAt ? ` · ${formatDateShort(row.paidAt)}` : ''}
                    {row.reference ? ` · ref ${row.reference}` : ''}
                  </div>
                  {row.note ? <div className="t-tiny faint">{row.note}</div> : null}
                </div>
                <div className="row">
                  <span className="t-h3">{formatInr(row.amount)}</span>
                  <Pill
                    label={row.status === 'PAID' ? `Paid ${row.paidMode ?? ''}`.trim() : 'Owed'}
                    color={row.status === 'PAID' ? 'var(--success)' : 'var(--warning)'}
                  />
                </div>
              </div>

              {canManage ? (
                <div className="row" style={{ marginTop: 'var(--s-md)' }}>
                  {row.status === 'PLANNED' ? (
                    <Chip
                      label="Mark paid"
                      onClick={() => {
                        setSettling(row);
                        setSettleMode('CASH');
                      }}
                    />
                  ) : null}
                  {row.status === 'PAID' ? (
                    row.reversalOfId || row.reversedBy ? null : (
                      <Chip label="Take it back" onClick={() => setTaking(row)} />
                    )
                  ) : (
                    <Chip
                      label="Cancel"
                      onClick={async () => {
                        await api.cancelDisbursement(row.id);
                        ledger.reload();
                      }}
                    />
                  )}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <Sheet
        open={Boolean(taking)}
        title="Take this payout back?"
        subtitle="It stays on the record with a correction beside it. Say why."
        onClose={closeTakeBack}>
        <Field
          label="Why"
          placeholder="Paid the wrong fitter"
          value={reason}
          onChange={setReason}
          autoFocus
        />
        <Button
          title="Take it back"
          block
          variant="danger"
          loading={busy}
          disabled={reason.trim().length < 4}
          onClick={async () => {
            if (!taking) return;
            setBusy(true);
            try {
              await api.reverseDisbursement(taking.id, reason.trim());
              setTaking(null);
              setReason('');
              ledger.reload();
            } finally {
              setBusy(false);
            }
          }}
        />
      </Sheet>

      <Sheet
        open={sheet}
        title={`Add ${data.label}`}
        subtitle="Money leaving this order"
        onClose={closeAdd}>
        <Field
          label="Paid to"
          placeholder="Fitter, transporter, polisher…"
          value={payeeName}
          onChange={setPayeeName}
          autoFocus
        />
        <Field label="Amount (₹)" value={amount} onChange={setAmount} pasteable={false} />

        <span className="field-label">What for?</span>
        <div className="wrap" style={{ marginBottom: 'var(--s-lg)' }}>
          {(categories.data ?? []).map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              selected={categoryId === category.id}
              onClick={() => setCategoryId(categoryId === category.id ? undefined : category.id)}
            />
          ))}
        </div>

        <Field label="Note" value={note} onChange={setNote} />

        <div className="wrap" style={{ marginBottom: 'var(--s-lg)' }}>
          <Chip
            label={alreadyPaid ? 'Already paid' : 'Still owed'}
            selected={alreadyPaid}
            onClick={() => setAlreadyPaid(!alreadyPaid)}
          />
          {alreadyPaid ? (
            <>
              <Chip label="Cash" selected={mode === 'CASH'} onClick={() => setMode('CASH')} />
              <Chip
                label="Online"
                selected={mode === 'ONLINE'}
                onClick={() => setMode('ONLINE')}
              />
            </>
          ) : null}
        </div>

        {error ? <p className="t-small danger">{error}</p> : null}
        <Button
          title="Add"
          block
          loading={busy}
          disabled={!payeeName.trim() || !amount || Number(amount) <= 0}
          onClick={create}
        />
      </Sheet>

      <Sheet
        open={Boolean(settling)}
        title="Mark as paid"
        subtitle={
          settling ? `${settling.payeeName} · ${formatInr(settling.amount)}` : undefined
        }
        onClose={closeSettle}>
        <span className="field-label">How did it go out?</span>
        <div className="wrap" style={{ marginBottom: 'var(--s-lg)' }}>
          <Chip label="Cash" selected={settleMode === 'CASH'} onClick={() => setSettleMode('CASH')} />
          <Chip
            label="Online"
            selected={settleMode === 'ONLINE'}
            onClick={() => setSettleMode('ONLINE')}
          />
        </div>
        <Field
          label="Reference"
          placeholder="UTR, cheque or slip number"
          value={settleRef}
          onChange={setSettleRef}
        />
        <Button
          title="Mark paid"
          block
          loading={busy}
          onClick={async () => {
            if (!settling) return;
            setBusy(true);
            try {
              await api.settleDisbursement(settling.id, {
                paidMode: settleMode,
                reference: settleRef.trim() || undefined,
              });
              setSettling(null);
              setSettleRef('');
              ledger.reload();
            } finally {
              setBusy(false);
            }
          }}
        />
      </Sheet>
    </>
  );
}

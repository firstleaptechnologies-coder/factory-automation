'use client';

import { use, useState } from 'react';
import type { PaymentMode, PaymentSummary } from '@decor/shared';
import { PERMISSIONS } from '@decor/shared';
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
import { formatDateTime, formatInr } from '@/lib/format';

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'var(--danger)',
  PARTIAL: 'var(--warning)',
  RECEIVED: 'var(--success)',
};

export default function PaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Shell>
      <Payments orderId={id} />
    </Shell>
  );
}

/**
 * The money on one order.
 *
 * Collections are a ledger rather than a single figure, because orders are paid
 * in instalments. Every receipt records how it arrived, and cash carries the
 * extra question the shop actually has to answer later: how much of it reached
 * the bank.
 */
function Payments({ orderId }: { orderId: string }) {
  const { can } = useAuth();
  const summary = useApi<PaymentSummary>(() => api.paymentSummary(orderId), [orderId]);

  const [sheet, setSheet] = useState(false);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [reference, setReference] = useState('');
  const [bankedNow, setBankedNow] = useState('');
  const [depositFor, setDepositFor] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const record = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.recordPayment(orderId, {
        amount: Number(amount),
        mode,
        reference: reference || undefined,
        depositedAmount: mode === 'CASH' && bankedNow ? Number(bankedNow) : undefined,
      });
      setSheet(false);
      setAmount('');
      setReference('');
      setBankedNow('');
      summary.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record');
    } finally {
      setBusy(false);
    }
  };

  const deposit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.recordDeposit({
        paymentId: depositFor ?? undefined,
        amount: Number(depositAmount),
      });
      setDepositFor(null);
      setDepositAmount('');
      summary.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record');
    } finally {
      setBusy(false);
    }
  };

  if (summary.loading) return <Loader label="Loading payments" />;
  const data = summary.data;
  if (!data) return null;

  return (
    <>
      <PageHead
        title="Payments"
        subtitle={`Settled against ${formatInr(data.total)}`}
        action={
          can(PERMISSIONS.PAYMENT_RECORD) && data.pending > 0 ? (
            <Button title="Record a payment" icon="plus" onClick={() => setSheet(true)} />
          ) : null
        }
      />

      <Card tone="accent" className="enter">
        <span className="t-label on-accent" style={{ opacity: 0.75 }}>
          Client owes
        </span>
        <div className="t-display on-accent">{formatInr(data.total)}</div>
        <div className="track" style={{ marginTop: 'var(--s-md)' }}>
          <div className="track-fill" style={{ width: `${Math.min(data.receivedPct, 100)}%` }} />
        </div>
        <div className="row-between" style={{ marginTop: 'var(--s-lg)' }}>
          <div>
            <div className="t-tiny on-accent" style={{ opacity: 0.75 }}>
              Received
            </div>
            <div className="t-h3 on-accent">{formatInr(data.received)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="t-tiny on-accent" style={{ opacity: 0.75 }}>
              Pending
            </div>
            <div className="t-h3 on-accent">{formatInr(data.pending)}</div>
          </div>
        </div>
      </Card>

      <div className="row-between" style={{ margin: 'var(--s-lg) 0' }}>
        <Pill label={data.status} color={STATUS_COLOR[data.status]} />
        <span className="t-tiny muted">{data.receivedPct}% collected</span>
      </div>

      <div className="grid-2">
        <Card size="sm">
          <div className="t-label muted">Cash</div>
          <div className="t-h2">{formatInr(data.cash.received)}</div>
          <div className="t-tiny muted">banked {formatInr(data.cash.deposited)}</div>
          {data.cash.inHand > 0 ? (
            <div className="t-tiny warning bold">{formatInr(data.cash.inHand)} in hand</div>
          ) : null}
        </Card>
        <Card size="sm">
          <div className="t-label muted">Online</div>
          <div className="t-h2">{formatInr(data.online.received)}</div>
          <div className="t-tiny muted">already in bank</div>
        </Card>
      </div>

      <SectionHead title="Receipts" />
      {data.payments.length === 0 ? (
        <EmptyState title="Nothing collected yet" />
      ) : (
        <div className="stack-sm">
          {data.payments.map((payment) => {
            const banked = payment.deposits.reduce((sum, d) => sum + Number(d.amount), 0);
            const inHand = Number(payment.amount) - banked;
            return (
              <Card key={payment.id} size="sm">
                <div className="row-between">
                  <div>
                    <div className="t-h3">{formatInr(payment.amount)}</div>
                    <div className="t-tiny muted">
                      {formatDateTime(payment.receivedAt)}
                      {payment.receivedBy ? ` · ${payment.receivedBy.name}` : ''}
                      {payment.reference ? ` · ref ${payment.reference}` : ''}
                    </div>
                  </div>
                  <Pill
                    label={payment.mode}
                    color={payment.mode === 'CASH' ? 'var(--warning)' : 'var(--info)'}
                  />
                </div>
                {payment.mode === 'CASH' ? (
                  <div className="row-between" style={{ marginTop: 'var(--s-md)' }}>
                    <span className="t-tiny muted">
                      banked {formatInr(banked)} · in hand {formatInr(inHand)}
                    </span>
                    {can(PERMISSIONS.CASH_DEPOSIT) && inHand > 0.009 ? (
                      <Chip
                        label="Bank it"
                        onClick={() => {
                          setDepositFor(payment.id);
                          setDepositAmount(String(inHand));
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <Sheet
        open={sheet}
        title="Record a payment"
        subtitle={`${formatInr(data.pending)} still owed`}
        onClose={() => setSheet(false)}>
        <span className="field-label">How did it arrive?</span>
        <div className="wrap" style={{ marginBottom: 'var(--s-lg)' }}>
          <Chip label="Cash" selected={mode === 'CASH'} onClick={() => setMode('CASH')} />
          <Chip label="Online" selected={mode === 'ONLINE'} onClick={() => setMode('ONLINE')} />
        </div>
        <Field
          label="Amount (₹)"
          placeholder={String(data.pending)}
          value={amount}
          onChange={setAmount}
          autoFocus
          pasteable={false}
        />
        {mode === 'ONLINE' ? (
          <Field
            label="Reference"
            placeholder="UTR or cheque number"
            value={reference}
            onChange={setReference}
          />
        ) : (
          <Field
            label="Banked straight away (₹)"
            placeholder="Leave empty if it stayed in hand"
            value={bankedNow}
            onChange={setBankedNow}
            hint="Cash not banked shows as in hand until it is."
            pasteable={false}
          />
        )}
        {error ? <p className="t-small danger">{error}</p> : null}
        <Button
          title="Record"
          block
          loading={busy}
          disabled={!amount || Number(amount) <= 0}
          onClick={record}
        />
      </Sheet>

      <Sheet open={Boolean(depositFor)} title="Bank this cash" onClose={() => setDepositFor(null)}>
        <Field
          label="Amount (₹)"
          value={depositAmount}
          onChange={setDepositAmount}
          autoFocus
          pasteable={false}
        />
        {error ? <p className="t-small danger">{error}</p> : null}
        <Button
          title="Record deposit"
          block
          loading={busy}
          disabled={!depositAmount || Number(depositAmount) <= 0}
          onClick={deposit}
        />
      </Sheet>
    </>
  );
}

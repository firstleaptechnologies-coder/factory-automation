'use client';

import { use, useState } from 'react';
import type { CreditReason, Invoice, Receivable } from '@decor/shared';
import { CREDIT_REASON_LABELS, PERMISSIONS } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import {
  Button,
  Card,
  Chip,
  Field,
  Loader,
  PageHead,
  Pill,
  SectionHead,
  Select,
  Sheet,
} from '@/ui';
import { formatDateShort, formatInr } from '@/lib/format';

const REASONS = Object.keys(CREDIT_REASON_LABELS) as CreditReason[];

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Shell>
      <InvoiceDetail invoiceId={id} />
    </Shell>
  );
}

/**
 * One invoice, and the two things that can be done to it.
 *
 * Cancelling keeps the number and needs a reason; crediting reduces what is
 * owed without a rupee moving. Neither deletes anything, and neither posts to
 * the ledger — the payment against the invoice is the only movement of money
 * in this story, and that posts on its own.
 */
function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const { can } = useAuth();
  const invoice = useApi<Invoice>(() => api.invoice(invoiceId), [invoiceId]);
  const data = invoice.data;
  const receivable = useApi<Receivable | null>(
    () => (data?.orderId ? api.orderReceivable(data.orderId) : Promise.resolve(null)),
    [data?.orderId],
  );

  const [cancelSheet, setCancelSheet] = useState(false);
  const [creditSheet, setCreditSheet] = useState(false);
  const [reason, setReason] = useState('');
  const [creditReason, setCreditReason] = useState<CreditReason>('RETURN');
  const [taxable, setTaxable] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCancel = can(PERMISSIONS.INVOICE_CANCEL);
  const canCredit = can(PERMISSIONS.CREDIT_NOTE_ISSUE);

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.cancelInvoice(invoiceId, reason.trim());
      setCancelSheet(false);
      setReason('');
      invoice.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel');
    } finally {
      setBusy(false);
    }
  };

  const credit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.creditInvoice(invoiceId, {
        taxable: Number(taxable),
        reason: creditReason,
        note: note.trim(),
      });
      setCreditSheet(false);
      setTaxable('');
      setNote('');
      invoice.reload();
      receivable.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not credit');
    } finally {
      setBusy(false);
    }
  };

  if (invoice.loading) return <Loader label="Loading invoice" />;
  if (!data) return null;

  const cancelled = data.status === 'CANCELLED';
  const notes = (data.creditNotes ?? []).filter((one) => one.status !== 'CANCELLED');
  const owed = receivable.data;

  return (
    <>
      <PageHead
        title={data.code}
        subtitle={data.clientName}
        action={
          <Button
            title="Open the invoice"
            icon="arrowUpRight"
            onClick={() => window.open(api.invoiceDocumentUrl(invoiceId), '_blank')}
          />
        }
      />

      <Card tone="accent" className="enter">
        <span className="t-label on-accent" style={{ opacity: 0.75 }}>
          Billed
        </span>
        <div className="t-display on-accent">{formatInr(data.total)}</div>
        <div className="row-between" style={{ marginTop: 'var(--s-lg)' }}>
          <div>
            <div className="t-tiny on-accent" style={{ opacity: 0.75 }}>
              Taxable
            </div>
            <div className="t-h3 on-accent">{formatInr(data.taxable)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="t-tiny on-accent" style={{ opacity: 0.75 }}>
              {data.interState ? 'IGST' : 'CGST + SGST'}
            </div>
            <div className="t-h3 on-accent">
              {formatInr(Number(data.cgst) + Number(data.sgst) + Number(data.igst))}
            </div>
          </div>
        </div>
      </Card>

      <div className="row-between" style={{ marginTop: 'var(--s-md)' }}>
        <Pill
          label={cancelled ? 'Cancelled' : 'Issued'}
          color={cancelled ? 'var(--danger)' : 'var(--success)'}
        />
        <span className="t-tiny muted">{formatDateShort(data.issuedOn)}</span>
      </div>

      {cancelled ? (
        <Card size="sm" style={{ marginTop: 'var(--s-md)' }}>
          <div className="t-label muted">Why it was cancelled</div>
          <div>{data.cancelReason}</div>
          <div className="t-tiny faint">
            The number stays used. Nothing is deleted and nothing is reissued.
          </div>
        </Card>
      ) : null}

      {owed ? (
        <Card size="sm" style={{ marginTop: 'var(--s-md)' }}>
          <div className="t-label muted">Against this order</div>
          {/*
            Three figures, never two. Credited money is not received money, so
            an order can never look paid by rupees nobody collected.
          */}
          <div className="row-between" style={{ marginTop: 'var(--s-sm)' }}>
            <div>
              <div className="t-tiny faint">Charged</div>
              <div className="t-h3">{formatInr(owed.charged)}</div>
            </div>
            <div>
              <div className="t-tiny faint">Credited</div>
              <div className="t-h3">{formatInr(owed.credited)}</div>
            </div>
            <div>
              <div className="t-tiny faint">Received</div>
              <div className="t-h3">{formatInr(owed.received)}</div>
            </div>
          </div>
          <div className="t-tiny muted" style={{ marginTop: 'var(--s-sm)' }}>
            {owed.settled ? 'Settled' : `${formatInr(owed.due)} still due`}
          </div>
          <div className="t-tiny faint">
            What was credited is shown beside what was collected, never inside it.
          </div>
        </Card>
      ) : null}

      <SectionHead title="What was billed" />
      <div className="stack-sm">
        {(data.items ?? []).map((item) => (
          <Card key={item.id} size="sm">
            <div className="row-between">
              <div style={{ minWidth: 0 }}>
                <div>{item.description}</div>
                <div className="t-tiny faint">
                  {Number(item.quantity)} {item.unit} × {formatInr(item.rate)}
                  {item.hsn ? ` · HSN ${item.hsn}` : ''}
                </div>
              </div>
              <span className="t-h3">{formatInr(item.amount)}</span>
            </div>
          </Card>
        ))}
      </div>

      <SectionHead
        title={
          notes.length === 0
            ? 'Credit notes'
            : `${notes.length} credit note${notes.length === 1 ? '' : 's'}`
        }
      />
      {notes.length === 0 ? (
        <p className="t-tiny faint">Nothing has been credited against this invoice.</p>
      ) : (
        <div className="stack-sm">
          {notes.map((one) => (
            <Card key={one.id} size="sm">
              <div className="row-between">
                <div style={{ minWidth: 0 }}>
                  <div className="t-h3">{one.code}</div>
                  <div className="t-tiny muted">
                    {CREDIT_REASON_LABELS[one.reason]} · {formatDateShort(one.issuedOn)}
                  </div>
                  <div className="t-tiny faint">{one.note}</div>
                </div>
                <div className="row">
                  <span className="t-h3">{formatInr(one.total)}</span>
                  <Chip
                    label="Open"
                    onClick={() => window.open(api.creditNoteDocumentUrl(one.id), '_blank')}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!cancelled ? (
        <div className="row" style={{ marginTop: 'var(--s-xl)' }}>
          {canCredit ? (
            <Chip label="Raise a credit note" onClick={() => setCreditSheet(true)} />
          ) : null}
          {canCancel && notes.length === 0 ? (
            <Chip label="Cancel this invoice" onClick={() => setCancelSheet(true)} />
          ) : null}
        </div>
      ) : null}

      <Sheet
        open={cancelSheet}
        title="Cancel this invoice?"
        subtitle="The number stays used. Say why — it is the only record of what it means now."
        onClose={() => setCancelSheet(false)}>
        <Field
          label="Why"
          placeholder="Raised against the wrong client"
          value={reason}
          onChange={setReason}
          autoFocus
        />
        {error ? <p className="t-tiny danger">{error}</p> : null}
        <Button
          title="Cancel it"
          block
          variant="danger"
          loading={busy}
          disabled={reason.trim().length < 4}
          onClick={cancel}
        />
      </Sheet>

      <Sheet
        open={creditSheet}
        title="Raise a credit note"
        subtitle="Reduces what the client owes. It is not a payment and is never counted as one."
        onClose={() => setCreditSheet(false)}>
        <Field
          label="Taxable value to credit (₹)"
          hint="The GST comes off in the proportion this invoice charged it."
          value={taxable}
          onChange={setTaxable}
          pasteable={false}
          autoFocus
        />
        <Select
          label="Why"
          value={creditReason}
          options={REASONS.map((key) => ({ value: key, label: CREDIT_REASON_LABELS[key] }))}
          onChange={(value) => setCreditReason(value as CreditReason)}
        />
        <Field
          label="In your own words"
          placeholder="Two panels came back chipped"
          value={note}
          onChange={setNote}
        />
        {error ? <p className="t-tiny danger">{error}</p> : null}
        <Button
          title="Raise it"
          block
          loading={busy}
          disabled={!taxable || Number(taxable) <= 0 || note.trim().length < 4}
          onClick={credit}
        />
      </Sheet>
    </>
  );
}

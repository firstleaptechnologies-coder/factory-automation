'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Challan, Invoice, Receivable } from '@fas/shared';
import { PERMISSIONS } from '@fas/shared';
import { api } from '@/lib/api';
import { openDocument } from '@/lib/documents';
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

export default function OrderInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Shell>
      <OrderInvoice orderId={id} />
    </Shell>
  );
}

/**
 * The paper on one order: its invoice, and the challans that went with it.
 *
 * One invoice per order, and never a second. A correction is a credit note,
 * raised from the invoice itself — which is also where the GST rules put it.
 * Challans are the other way round: as many as there were loads.
 */
function OrderInvoice({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { can } = useAuth();

  const invoice = useApi<Invoice | null>(() => api.orderInvoice(orderId), [orderId]);
  const receivable = useApi<Receivable | null>(() => api.orderReceivable(orderId), [orderId]);
  const challans = useApi<Challan[]>(() => api.challans({ orderId }), [orderId]);

  const [challanSheet, setChallanSheet] = useState(false);
  const [shipTo, setShipTo] = useState('');
  const [transport, setTransport] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canIssue = can(PERMISSIONS.INVOICE_ISSUE);

  const raise = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.raiseInvoice(orderId);
      router.push(`/invoices/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not raise it');
    } finally {
      setBusy(false);
    }
  };

  const issueChallan = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.issueChallan(orderId, {
        shipTo: shipTo.trim() || undefined,
        transport: transport.trim() || undefined,
        vehicle: vehicle.trim() || undefined,
      });
      setChallanSheet(false);
      setShipTo('');
      setTransport('');
      setVehicle('');
      challans.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not issue it');
    } finally {
      setBusy(false);
    }
  };

  if (invoice.loading) return <Loader label="Loading" />;

  const bill = invoice.data;
  const owed = receivable.data;
  const loads = challans.data ?? [];

  return (
    <>
      <PageHead
        title="Invoice and challans"
        subtitle="The paper on this order"
        action={
          canIssue ? <Chip label="Issue a challan" onClick={() => setChallanSheet(true)} /> : null
        }
      />

      {bill ? (
        <Card tone="accent" className="enter" onClick={() => router.push(`/invoices/${bill.id}`)}>
          <span className="t-label on-accent" style={{ opacity: 0.75 }}>
            {bill.code}
          </span>
          <div className="t-display on-accent">{formatInr(bill.total)}</div>
          <div className="t-tiny on-accent" style={{ opacity: 0.75, marginTop: 'var(--s-sm)' }}>
            {bill.status === 'CANCELLED' ? 'Cancelled' : 'Issued'} ·{' '}
            {formatDateShort(bill.issuedOn)}
          </div>
        </Card>
      ) : (
        <Card>
          <div className="t-h3">Not invoiced yet</div>
          <p className="t-tiny muted">
            One invoice per order. Once it is raised, a correction is a credit note rather
            than a second bill.
          </p>
          {canIssue ? (
            <Button title="Raise the invoice" loading={busy} onClick={raise} />
          ) : null}
        </Card>
      )}

      {error ? <p className="t-tiny danger">{error}</p> : null}

      {owed ? (
        <Card size="sm" style={{ marginTop: 'var(--s-md)' }}>
          <div className="t-label muted">Charged, credited, received</div>
          {/*
            Three figures on purpose. Folding what was credited into what was
            received would let an order read as paid by money nobody collected.
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
            <Pill
              label={owed.settled ? 'Settled' : `${formatInr(owed.due)} due`}
              color={owed.settled ? 'var(--success)' : 'var(--warning)'}
            />
          </div>
        </Card>
      ) : null}

      <SectionHead
        title={
          loads.length === 0
            ? 'Delivery challans'
            : `${loads.length} challan${loads.length === 1 ? '' : 's'}`
        }
      />
      <p className="t-tiny faint">
        A challan travels with the goods and carries no prices. One per load — a job often
        leaves in two vans on two days.
      </p>

      {loads.length === 0 ? (
        <EmptyState title="Nothing has gone out yet" />
      ) : (
        <div className="stack-sm">
          {loads.map((row) => (
            <Card key={row.id} size="sm">
              <div className="row-between">
                <div style={{ minWidth: 0 }}>
                  <div className="t-h3">{row.code}</div>
                  <div className="t-tiny muted">
                    {formatDateShort(row.issuedOn)}
                    {row.vehicle ? ` · ${row.vehicle}` : ''}
                  </div>
                  {row.shipTo ? <div className="t-tiny faint">{row.shipTo}</div> : null}
                </div>
                <Chip
                  label="Open"
                  onClick={() => void openDocument(`/challans/${row.id}/document`)}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Sheet
        open={challanSheet}
        title="Issue a delivery challan"
        subtitle="It travels with the goods. No prices on it."
        onClose={() => setChallanSheet(false)}>
        <Field
          label="Ship to"
          placeholder="Leave blank for the client's site address"
          value={shipTo}
          onChange={setShipTo}
        />
        <Field
          label="Transport"
          placeholder="Who is carrying it"
          value={transport}
          onChange={setTransport}
        />
        <Field label="Vehicle" placeholder="RJ19 GA 4412" value={vehicle} onChange={setVehicle} />
        <Button title="Issue it" block loading={busy} onClick={issueChallan} />
      </Sheet>
    </>
  );
}

'use client';

import { Suspense, use, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Purchase } from '@decor/shared';
import { PERMISSIONS, PURCHASE_STATUS_LABELS, today } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { Button, Card, Field, Loader, PageHead, Pill, Sheet } from '@/ui';
import { Select } from '@/ui/Select';
import { formatDateShort, formatInr } from '@/lib/format';
import { PurchaseForm } from '../PurchaseForm';

export default function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Shell>
      <Suspense fallback={<Loader />}>
        <Page id={id} />
      </Suspense>
    </Shell>
  );
}

/** The same route, reading or editing the draft — as a quote and an expense are. */
function Page({ id }: { id: string }) {
  const editing = useSearchParams().get('edit') === '1';
  return editing ? <PurchaseForm id={id} /> : <Detail id={id} />;
}

/**
 * One purchase, from ordering it to paying for it.
 *
 * The four acts are separate buttons because they are separate decisions:
 * sending an order, recording what turned up, entering the vendor's bill, and
 * handing over the money. A shop does them days apart.
 */
function Detail({ id }: { id: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const purchase = useApi<Purchase>(() => api.purchase(id), [id]);

  const [receiving, setReceiving] = useState(false);
  const [received, setReceived] = useState<Record<string, string>>({});
  const [billing, setBilling] = useState(false);
  const [billNumber, setBillNumber] = useState('');
  const [billedOn, setBilledOn] = useState(today());
  const [paying, setPaying] = useState(false);
  const [mode, setMode] = useState<'CASH' | 'ONLINE'>('ONLINE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = can(PERMISSIONS.PURCHASE_MANAGE);
  const canPay = can(PERMISSIONS.PURCHASE_PAY);

  if (purchase.loading) return <Loader />;
  const data = purchase.data;
  if (!data) return null;

  const draft = data.status === 'DRAFT';
  const open = data.status === 'ORDERED' || data.status === 'PART_RECEIVED';
  const outstanding = (data.items ?? []).filter(
    (item) => Number(item.receivedQuantity) < Number(item.quantity),
  );

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      purchase.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title={data.vendor.name}
        subtitle={`${data.code} · ${PURCHASE_STATUS_LABELS[data.status]}`}
        action={
          <div className="row">
            {canManage && draft ? (
              <>
                <Button
                  title="Edit"
                  variant="dark"
                  icon="edit"
                  onClick={() => router.push(`/purchases/${id}?edit=1`)}
                />
                <Button
                  title="Send it"
                  loading={busy}
                  onClick={() => act(() => api.placePurchase(id))}
                />
              </>
            ) : null}
            {canManage && open ? (
              <Button
                title="Something arrived"
                onClick={() => {
                  setReceived(
                    Object.fromEntries(
                      outstanding.map((item) => [
                        item.id,
                        String(Number(item.quantity) - Number(item.receivedQuantity)),
                      ]),
                    ),
                  );
                  setReceiving(true);
                }}
              />
            ) : null}
            {canManage && !draft && !data.billNumber ? (
              <Button title="Their bill" variant="dark" onClick={() => setBilling(true)} />
            ) : null}
            {canPay && data.billNumber && !data.paidOn ? (
              <Button title="Pay it" onClick={() => setPaying(true)} />
            ) : null}
          </div>
        }
      />

      <Card tone="accent" className="enter">
        <span className="t-label on-accent" style={{ opacity: 0.75 }}>
          {(data.items ?? []).length} {(data.items ?? []).length === 1 ? 'line' : 'lines'}
        </span>
        <div className="t-display on-accent">{formatInr(data.total)}</div>
        <div className="t-small on-accent" style={{ opacity: 0.8, marginTop: 4 }}>
          {formatInr(data.subtotal)} plus {formatInr(data.taxTotal)} tax
          {Number(data.otherCharges) ? ` and ${formatInr(data.otherCharges)} charges` : ''}
        </div>
      </Card>

      {data.billNumber ? (
        <Card size="sm" style={{ marginTop: 'var(--s-lg)' }}>
          <div className="t-label">Their bill</div>
          <div className="t-small muted">
            {data.billNumber} · {formatDateShort(data.billedOn)}
            {data.paidOn ? ` · paid ${formatDateShort(data.paidOn)}` : ' · unpaid'}
          </div>
        </Card>
      ) : null}

      {error ? (
        <div className="t-small" style={{ color: 'var(--danger)', marginTop: 'var(--s-md)' }}>
          {error}
        </div>
      ) : null}

      <div style={{ height: 'var(--s-lg)' }} />

      <Card size="sm" className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Thickness</th>
              <th className="num">Ordered</th>
              <th className="num">Arrived</th>
              <th className="num">Rate</th>
              <th className="num">Line</th>
            </tr>
          </thead>
          <tbody>
            {(data.items ?? []).map((item) => (
              <tr key={item.id}>
                <td className="bold">{item.material.name}</td>
                <td className="muted">
                  {item.thickness
                    ? (item.thickness.label ?? `${item.thickness.valueMm} mm`)
                    : '—'}
                </td>
                <td className="num">
                  {Number(item.quantity)} {item.unit}
                </td>
                <td className="num muted">{Number(item.receivedQuantity)}</td>
                <td className="num muted">{formatInr(item.rate)}</td>
                <td className="num bold">{formatInr(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Sheet
        open={receiving}
        title="What turned up?"
        subtitle="Stock goes on the rack against this order, so it has a bill behind it"
        onClose={() => setReceiving(false)}>
        {outstanding.map((item) => (
          <Field
            key={item.id}
            label={`${item.material.name} (${
              Number(item.quantity) - Number(item.receivedQuantity)
            } outstanding)`}
            value={received[item.id] ?? ''}
            onChange={(value) => setReceived((current) => ({ ...current, [item.id]: value }))}
          />
        ))}
        <Button
          title="Put it on the rack"
          block
          loading={busy}
          onClick={() =>
            act(async () => {
              await api.receivePurchase(id, {
                lines: Object.entries(received)
                  .filter(([, quantity]) => Number(quantity) > 0)
                  .map(([purchaseItemId, quantity]) => ({
                    purchaseItemId,
                    quantity: Number(quantity),
                  })),
              });
              setReceiving(false);
            })
          }
        />
      </Sheet>

      <Sheet
        open={billing}
        title="Their bill"
        subtitle="The vendor’s own number and date"
        onClose={() => setBilling(false)}>
        <Field label="Bill number" value={billNumber} onChange={setBillNumber} autoFocus />
        <Field label="Dated" type="date" value={billedOn} onChange={setBilledOn} />
        <Button
          title="Save it"
          block
          loading={busy}
          disabled={!billNumber.trim()}
          onClick={() =>
            act(async () => {
              await api.billPurchase(id, { billNumber: billNumber.trim(), billedOn });
              setBilling(false);
            })
          }
        />
      </Sheet>

      <Sheet
        open={paying}
        title="Pay this bill?"
        subtitle="It posts to the ledger against the vendor and their bill number"
        onClose={() => setPaying(false)}>
        <Select
          label="Paid by"
          value={mode}
          options={[
            { value: 'ONLINE', label: 'Bank transfer' },
            { value: 'CASH', label: 'Cash' },
          ]}
          onChange={(value) => setMode(value as 'CASH' | 'ONLINE')}
        />
        <Button
          title="Pay it"
          block
          loading={busy}
          onClick={() =>
            act(async () => {
              await api.payPurchase(id, { mode });
              setPaying(false);
            })
          }
        />
      </Sheet>
    </>
  );
}

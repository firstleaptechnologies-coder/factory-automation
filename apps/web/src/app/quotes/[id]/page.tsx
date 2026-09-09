'use client';

import { use, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Estimate, EstimateStatus, HistoryEntry } from '@fas/shared';
import { PERMISSIONS } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { HistoryTimeline } from '@/components/HistoryTimeline';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { EstimateForm } from '@/components/EstimateForm';
import {
  Button,
  Card,
  Field,
  Loader,
  PageHead,
  Pill,
  SectionHead,
  Sheet,
  SheetOption,
} from '@/ui';
import { formatDateShort, formatInr } from '@/lib/format';

const STATUSES: EstimateStatus[] = ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED'];

export default function EstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const editing = useSearchParams().get('edit') === '1';
  return (
    <Shell>{editing ? <EstimateForm estimateId={id} /> : <EstimateDetail estimateId={id} />}</Shell>
  );
}

function EstimateDetail({ estimateId }: { estimateId: string }) {
  const router = useRouter();
  const { can } = useAuth();
  /* What has been changed on this, and by whom. */
  const history = useApi<HistoryEntry[]>(
    () => api.history('quotes', estimateId),
    [estimateId],
  );

  const estimate = useApi<Estimate>(() => api.estimate(estimateId), [estimateId]);

  const [statusSheet, setStatusSheet] = useState(false);
  const [convertSheet, setConvertSheet] = useState(false);
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = can(PERMISSIONS.ESTIMATE_MANAGE);

  if (estimate.loading) return <Loader label="Loading estimate" />;
  const data = estimate.data;
  if (!data) return null;
  const interState = Number(data.igst) > 0;

  return (
    <>
      <PageHead
        title={data.code}
        subtitle={data.client?.name ?? data.clientName ?? undefined}
        action={
          <div className="row">
            <Pill label={data.status} color="var(--accent)" />
            <Button
              title="Open the PDF"
              icon="clipboard"
              onClick={() =>
                // The server renders the document; the browser prints or saves
                // it. Same markup the app turns into a PDF on the phone.
                window.open(api.estimateDocumentUrl(estimateId), '_blank')
              }
            />
          </div>
        }
      />

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div>
          <Card tone="accent" className="enter">
            <span className="t-label on-accent" style={{ opacity: 0.75 }}>
              Client pays
            </span>
            <div className="t-display on-accent">{formatInr(data.grandTotal)}</div>
            <div className="row-between" style={{ marginTop: 'var(--s-lg)' }}>
              <div>
                <div className="t-tiny on-accent" style={{ opacity: 0.75 }}>
                  Taxable
                </div>
                <div className="t-h3 on-accent">{formatInr(data.total)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="t-tiny on-accent" style={{ opacity: 0.75 }}>
                  GST
                </div>
                <div className="t-h3 on-accent">{formatInr(data.taxAmount)}</div>
              </div>
            </div>
          </Card>

          <SectionHead title="Lines" />
          <Card size="sm" className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th className="num">Rate</th>
                  <th className="num">Discount</th>
                  <th className="num">GST</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td className="bold">
                      {item.name}
                      {item.hsnSac ? (
                        <div className="t-tiny faint">HSN {item.hsnSac}</div>
                      ) : null}
                    </td>
                    <td className="num muted">
                      {Number(item.quantity)} {item.unit}
                    </td>
                    <td className="num muted">{formatInr(item.ratePerUnit)}</td>
                    <td className="num muted">
                      {formatInr(item.discountAmount)}
                      <div className="t-tiny faint">{Number(item.discountPct)}%</div>
                    </td>
                    <td className="num muted">
                      {formatInr(item.taxAmount)}
                      <div className="t-tiny faint">{Number(item.gstRatePct)}%</div>
                    </td>
                    <td className="num bold">{formatInr(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="stack-lg">
          <Card>
            <SectionHead title="Totals" />
            <Row label="Sub total" value={formatInr(data.subtotal)} />
            {Number(data.discount) > 0 ? (
              <Row label="Discount" value={formatInr(data.discount)} />
            ) : null}
            {interState ? (
              <Row label="IGST" value={formatInr(data.igst)} />
            ) : (
              <>
                <Row label="SGST" value={formatInr(data.sgst)} />
                <Row label="CGST" value={formatInr(data.cgst)} />
              </>
            )}
            <div className="divider" />
            <Row label="Total" value={formatInr(data.grandTotal)} accent />
            {Number(data.savedAmount) > 0 ? (
              <Row label="You saved" value={formatInr(data.savedAmount)} />
            ) : null}
            <p className="t-tiny faint" style={{ marginTop: 'var(--s-md)' }}>
              Issued {formatDateShort(data.issuedOn)}
              {data.validTill ? ` · valid till ${formatDateShort(data.validTill)}` : ''}
            </p>
          </Card>

          {/* Where this came from. A quote written for an enquiry belongs to
              it, and the pipeline's figure for that enquiry is this one. */}
          {data.lead ? (
            <Card
              className="row-card"
              onClick={() => router.push(`/leads?lead=${data.lead!.id}`)}>
              <SectionHead title="Quoted for" />
              <div className="t-body bold truncate">{data.lead.title}</div>
              <div className="t-tiny faint">
                {data.lead.code}
                {data.lead.status ? ` · ${data.lead.status.name}` : ''}
              </div>
            </Card>
          ) : null}

          {canManage ? (
            <Card>
              <SectionHead title="Actions" />
              <div className="stack-sm">
                <Button
                  title="Edit"
                  variant="dark"
                  block
                  onClick={() => router.push(`/quotes/${estimateId}?edit=1`)}
                />
                <Button
                  title="Change status"
                  variant="dark"
                  block
                  onClick={() => setStatusSheet(true)}
                />
                {data.status !== 'CONVERTED' && data.clientId ? (
                  <Button
                    title="Turn into an order"
                    block
                    icon="arrowUpRight"
                    onClick={() => setConvertSheet(true)}
                  />
                ) : null}
                {data.status === 'CONVERTED' && data.orderId ? (
                  <Button
                    title="Open the order"
                    variant="dark"
                    block
                    onClick={() => router.push(`/orders/${data.orderId}`)}
                  />
                ) : null}
              </div>
              {!data.clientId ? (
                <p className="t-tiny faint" style={{ marginTop: 'var(--s-md)' }}>
                  Attach this estimate to a client before it can become an order.
                </p>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>

      <Sheet open={statusSheet} title="Quote status" onClose={() => setStatusSheet(false)}>
        {STATUSES.map((status) => (
          <SheetOption
            key={status}
            label={status}
            selected={data.status === status}
            onClick={async () => {
              setStatusSheet(false);
              await api.setEstimateStatus(estimateId, status);
              estimate.reload();
            }}
          />
        ))}
      </Sheet>

      <Sheet
        open={convertSheet}
        title="Turn into an order"
        subtitle={`${formatInr(data.grandTotal)} carries across unchanged`}
        onClose={() => setConvertSheet(false)}>
        <p className="t-small muted" style={{ marginTop: 0 }}>
          The estimate stays as the record of what was quoted. The order starts as
          one lump sum for the agreed figure; the floor prices the real lines once
          the job is measured.
        </p>
        <Field
          label="Site"
          placeholder="Where the work happens"
          value={location}
          onChange={setLocation}
          autoFocus
        />
        {error ? <p className="t-small danger">{error}</p> : null}
        <Button
          title="Create the order"
          block
          loading={busy}
          disabled={!location.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const order = await api.convertEstimate(estimateId, {
                location: location.trim(),
              });
              router.push(`/orders/${order.id}`);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not convert');
            } finally {
              setBusy(false);
            }
          }}
        />
      </Sheet>

      <SectionHead title="History" />
      <Card size="sm">
        <HistoryTimeline entries={history.data ?? []} empty="Nothing has changed since this quote was written" />
      </Card>
    </>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="row-between" style={{ padding: '3px 0' }}>
      <span className="t-small muted">{label}</span>
      <span className={accent ? 't-h3 accent' : 't-body bold'}>{value}</span>
    </div>
  );
}

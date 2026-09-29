'use client';

import { use, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  CustomFieldDefinition,
  HistoryEntry,
  Lead,
  Material,
  Order,
  WorkflowStatus,
  WorkflowTransition,
} from '@fas/shared';
import { PERMISSIONS, leadValue, leadValueSource } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { openDocument } from '@/lib/documents';
import { HistoryTimeline } from '@/components/HistoryTimeline';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { ConvertLeadDialog } from '@/components/ConvertLeadDialog';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Loader,
  PageHead,
  Pill,
  SectionHead,
  Sheet,
  SheetOption,
} from '@/ui';
import { formatDateTime, formatInr, relativeTime } from '@/lib/format';

type NextMove = WorkflowTransition & { toStatus: WorkflowStatus };

/** A step back along an arrow that exists. See the order screen. */
type BackMove = { transitionId: string; toStatus: WorkflowStatus };

export default function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Shell>
      <LeadDetail leadId={id} />
    </Shell>
  );
}

/** Where a quote stands, at a glance. */
function quoteColour(status: string): string {
  if (status === 'ACCEPTED' || status === 'CONVERTED') return 'var(--success)';
  if (status === 'DECLINED' || status === 'EXPIRED') return 'var(--danger)';
  if (status === 'SENT') return 'var(--accent)';
  return 'var(--surface-lit)';
}

/**
 * One enquiry.
 *
 * The web had no such screen: clicking a lead dropped you on the board with the
 * whole pipeline around it, which answers a different question from the one
 * being asked. Everything the app's lead screen carries is here — who it is
 * from, what has been quoted, where it stands and how it got there — because a
 * shop that works at the desk should not have to reach for a phone to read an
 * enquiry.
 */
function LeadDetail({ leadId }: { leadId: string }) {
  const router = useRouter();
  const { can } = useAuth();

  const [moves, setMoves] = useState<NextMove[]>([]);
  const [backMoves, setBackMoves] = useState<BackMove[]>([]);
  const [moveSheet, setMoveSheet] = useState(false);
  const [pending, setPending] = useState<NextMove | null>(null);
  const [pendingBack, setPendingBack] = useState<BackMove | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  const canMoveBack = can(PERMISSIONS.LEAD_MOVE_BACK);

  /*
   * The history is its own request rather than part of the record.
   *
   * It is no longer only the stages this passed through: it holds what was
   * edited and by whom, which comes from the trail rather than from the row.
   */
  const history = useApi<HistoryEntry[]>(
    () => api.history('leads', leadId),
    [leadId],
  );

  const lead = useApi<Lead>(
    useCallback(async () => {
      const fresh = await api.lead(leadId);
      setMoves(await api.allowedNext(fresh.status.id));
      // Only asked for by somebody who could act on the answer.
      setBackMoves(canMoveBack ? await api.allowedBack(fresh.status.id) : []);
      return fresh;
    }, [leadId, canMoveBack]),
    [leadId, canMoveBack],
  );

  const fields = useApi<CustomFieldDefinition[]>(() => api.leadFields(), []);
  const materials = useApi<Material[]>(() => api.materials(), []);

  const move = async (target: NextMove, withNote?: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.changeLeadStatus(leadId, { toStatusId: target.toStatusId, note: withNote });
      setMoveSheet(false);
      setPending(null);
      setNote('');
      lead.reload();
      history.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move it');
    } finally {
      setBusy(false);
    }
  };

  /** Send it back a stage. The server asks for the same acknowledgement. */
  const moveBack = async (target: BackMove, withNote?: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.changeLeadStatus(leadId, {
        toStatusId: target.toStatus.id,
        note: withNote,
        reverse: true,
      });
      setMoveSheet(false);
      setPendingBack(null);
      setNote('');
      lead.reload();
      history.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move it back');
    } finally {
      setBusy(false);
    }
  };

  if (lead.loading) return <Loader label="Loading the enquiry" />;
  const data = lead.data;
  if (!data) return null;

  const values = (data.customFields ?? {}) as Record<string, unknown>;
  const filled = (fields.data ?? []).filter(
    (definition) => values[definition.key] !== undefined && values[definition.key] !== '',
  );

  return (
    <>
      {/* The heading and the actions stay put: on a long enquiry the way to
          move it along was a scroll back to the top away. */}
      <div className="sticky-bar">
      <PageHead
        title={data.title}
        subtitle={`${data.code} · ${relativeTime(data.createdAt)}`}
        action={
          <div className="row">
            <Button title="Back to leads" variant="dark" onClick={() => router.push('/leads')} />
            {moves.length || backMoves.length ? (
              <Button title="Move stage" icon="arrowUpRight" onClick={() => setMoveSheet(true)} />
            ) : null}
          </div>
        }
      />
      </div>

      {error ? <div className="banner danger">{error}</div> : null}

      <Card tone="accent" className="enter">
        <span className="t-label on-accent" style={{ opacity: 0.75 }}>
          {{ quoted: 'Quoted', priced: 'Priced', estimated: 'Estimated' }[
            leadValueSource(data) ?? 'estimated'
          ]}
        </span>
        <div className="t-display on-accent">
          {leadValue(data) !== null ? formatInr(leadValue(data)!) : '—'}
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <Pill label={data.status.name} color={data.status.color} />
          {data.source ? (
            <span className="t-small on-accent" style={{ opacity: 0.8 }}>
              via {data.source.name}
            </span>
          ) : null}
        </div>
      </Card>

      <div className="grid-2" style={{ marginTop: 'var(--s-lg)' }}>
        <Card>
          <SectionHead title="Who it is from" />
          <Row label="Contact" value={data.contactName ?? data.client?.name ?? 'Not taken yet'} />
          {data.contactPhone ? <Row label="Phone" value={data.contactPhone} /> : null}
          {data.company ? <Row label="Company" value={data.company} /> : null}
          {data.location ? <Row label="Site" value={data.location} /> : null}
          {/* Asked for on the call, so it is readable back — an address
              somebody types and never sees again is one they type twice. */}
          {data.billingAddress ? <Row label="Billing" value={data.billingAddress} /> : null}
          {data.shippingAddress ? (
            <Row label="Shipping" value={data.shippingAddress} />
          ) : null}
          {data.owner ? <Row label="Owner" value={data.owner.name} /> : null}
          {data.client ? (
            <Button
              title={`Open ${data.client.name}`}
              variant="dark"
              block
              onClick={() => router.push(`/clients/${data.client!.id}`)}
            />
          ) : null}
        </Card>

        <Card>
          <SectionHead title="What happens next" />
          {data.convertedOrder ? (
            <>
              <p className="t-small muted" style={{ marginTop: 0 }}>
                This enquiry became work on {formatDateTime(data.convertedAt ?? data.createdAt)}.
              </p>
              <Button
                title={`Open ${data.convertedOrder.code}`}
                block
                onClick={() => router.push(`/orders/${data.convertedOrder!.id}`)}
              />
            </>
          ) : (
            <>
              {can(PERMISSIONS.LEAD_CONVERT) ? (
                <Button
                  title="Convert to an order"
                  icon="arrowUpRight"
                  block
                  onClick={() => setConverting(true)}
                />
              ) : null}
              {can(PERMISSIONS.ESTIMATE_MANAGE) ? (
                <Button
                  title="Quote this enquiry"
                  variant="dark"
                  block
                  onClick={() => {
                    const search = new URLSearchParams({ leadId: data.id, leadCode: data.code });
                    if (data.title) search.set('title', data.title);
                    if (data.client?.id) search.set('clientId', data.client.id);
                    const name = data.client?.name ?? data.contactName;
                    if (name) search.set('clientName', name);
                    if (data.location) search.set('location', data.location);
                    router.push(`/quotes/new?${search.toString()}`);
                  }}
                />
              ) : null}
            </>
          )}
          {data.notes ? <p className="t-small muted">{data.notes}</p> : null}
        </Card>
      </div>

      {filled.length ? (
        <Card style={{ marginTop: 'var(--s-lg)' }}>
          <SectionHead title="What the shop captured" />
          {filled.map((definition) => (
            <Row
              key={definition.id}
              label={definition.label}
              value={String(values[definition.key])}
            />
          ))}
        </Card>
      ) : null}

      {/*
        What the enquiry was priced at, if it was — the same lines a quotation
        carries, because the shop prices the job on the phone and quotes from
        it afterwards. The printed page is the server's own, the same markup
        the app previews and turns into a PDF.
      */}
      {data.items?.length ? (
        <>
          <SectionHead
            title="Items"
            action={
              <Button
                title="Open the printed enquiry"
                icon="clipboard"
                variant="dark"
                onClick={() => void openDocument(`/leads/${leadId}/document`)}
              />
            }
          />
          <Card size="sm" className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th className="num">Rate</th>
                  <th className="num">Discount</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td className="bold">
                      {item.name}
                      {item.description ? (
                        <div className="t-tiny muted">{item.description}</div>
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
                    <td className="num bold">{formatInr(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row-between" style={{ marginTop: 'var(--s-md)' }}>
              <span className="t-small muted">
                {Number(data.discount) > 0
                  ? `Less ${formatInr(Number(data.discount))} discount · `
                  : ''}
                Before tax — GST is worked out on the quote
              </span>
              <span className="t-h2">{formatInr(Number(data.total))}</span>
            </div>
          </Card>
        </>
      ) : null}

      {/* What has been quoted for this enquiry. The pipeline's figure for it
          comes from these. */}
      <SectionHead title="Quotes" />
      {(data.estimates?.length ?? 0) === 0 ? (
        <EmptyState
          icon="tag"
          title="Nothing quoted yet"
          message="A quote written here is linked to this enquiry."
        />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Quote</th>
                <th>Issued</th>
                <th>Status</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.estimates?.map((quote) => (
                <tr
                  key={quote.id}
                  data-testid={`quote-${quote.id}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/quotes/${quote.id}`)}>
                  <td className="bold">{quote.code}</td>
                  <td className="muted">{formatDateTime(quote.issuedOn)}</td>
                  <td>
                    <Pill label={quote.status} color={quoteColour(quote.status)} />
                  </td>
                  <td className="num bold accent">{formatInr(quote.grandTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <SectionHead title="History" />
      <Card size="sm">
        <HistoryTimeline entries={history.data ?? []} />
      </Card>

      <Sheet
        open={moveSheet}
        title="Move this enquiry"
        subtitle={`From ${data.status.name}`}
        onClose={() => {
          setMoveSheet(false);
          setPending(null);
          setPendingBack(null);
          setNote('');
        }}>
        {pendingBack ? (
          <>
            <p className="t-body" style={{ marginTop: 0 }}>
              <span className="bold">{data.status.name}</span> →{' '}
              <span className="bold warning">{pendingBack.toStatus.name}</span> is not a step
              this pipeline draws.
            </p>
            <p className="t-small muted">
              {data.code} would go back a stage. It is recorded as a reversal, with your name
              on it. Are you sure?
            </p>
            <Field
              label="Why is it going back?"
              hint="A note for whoever reads this later"
              value={note}
              onChange={setNote}
              multiline
              autoFocus
            />
            <Button
              title="Yes, move it back"
              block
              loading={busy}
              onClick={() => moveBack(pendingBack, note.trim() || undefined)}
            />
            <Button
              title="Leave it where it is"
              variant="ghost"
              block
              onClick={() => {
                setPendingBack(null);
                setNote('');
              }}
            />
          </>
        ) : pending ? (
          <>
            <Field
              label="Note"
              hint={`${pending.toStatus.name} needs a note.`}
              value={note}
              onChange={setNote}
              multiline
              autoFocus
            />
            <Button
              title={`Move to ${pending.toStatus.name}`}
              block
              loading={busy}
              disabled={!note.trim()}
              onClick={() => move(pending, note.trim())}
            />
          </>
        ) : (
          <>
            {moves.length === 0 && backMoves.length === 0 ? (
              <p className="t-small muted">
                No moves are allowed from {data.status.name}. An admin can add one on the
                status flow.
              </p>
            ) : null}

            {moves.map((transition) => (
              <SheetOption
                key={transition.id}
                label={transition.label ?? transition.toStatus.name}
                description={
                  transition.requiresNote ? 'Needs a note' : `Move to ${transition.toStatus.name}`
                }
                accent={transition.toStatus.color}
                onClick={() =>
                  transition.requiresNote ? setPending(transition) : move(transition)
                }
              />
            ))}

            {backMoves.length ? (
              <>
                <SectionHead title="Not the usual journey" />
                {backMoves.map((back) => (
                  <SheetOption
                    key={back.transitionId}
                    label={`Back to ${back.toStatus.name}`}
                    description="Asks you to confirm first"
                    accent={back.toStatus.color}
                    onClick={() => setPendingBack(back)}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </Sheet>

      {converting ? (
        <ConvertLeadDialog
          lead={data}
          materials={materials.data ?? []}
          onClose={() => setConverting(false)}
          onConverted={async (order: Order) => {
            setConverting(false);
            router.push(`/orders/${order.id}`);
          }}
        />
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row" style={{ padding: '6px 0' }}>
      <span className="t-small muted">{label}</span>
      <div className="spacer" />
      <span className="t-small bold">{value}</span>
    </div>
  );
}

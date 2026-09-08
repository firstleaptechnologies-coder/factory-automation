'use client';

import { use, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  CustomFieldDefinition,
  Lead,
  Material,
  Order,
  WorkflowStatus,
  WorkflowTransition,
} from '@decor/shared';
import { PERMISSIONS } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
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
          {data.quotedValue ? 'Quoted' : 'Estimated'}
        </span>
        <div className="t-display on-accent">
          {data.quotedValue || data.estimatedValue
            ? formatInr(Number(data.quotedValue ?? data.estimatedValue))
            : '—'}
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
      <Card size="sm" className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Moved</th>
              <th>Note</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {(data.statusHistory ?? []).map((entry) => (
              <tr key={entry.id}>
                <td className="muted">{formatDateTime(entry.changedAt)}</td>
                <td>
                  {entry.fromStatus ? (
                    <span className="muted">{entry.fromStatus.name} → </span>
                  ) : null}
                  <span className="bold">{entry.toStatus.name}</span>
                  {/* A step back reads as an ordinary one otherwise. */}
                  {entry.reversed ? (
                    <span className="t-tiny warning bold"> · went back</span>
                  ) : null}
                </td>
                <td className="muted">{entry.note ?? '—'}</td>
                <td className="muted">{entry.changedBy?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

'use client';

import { use, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Order, TaxTreatment, WorkflowStatus, WorkflowTransition } from '@decor/shared';
import { LENGTH_UNITS, PERMISSIONS, UNIT_LABEL } from '@decor/shared';
import type { LengthUnit } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import {
  Button,
  Card,
  Chip,
  Field,
  Icon,
  ImageViewer,
  Loader,
  PageHead,
  Pill,
  SectionHead,
  ThumbImage,
  Sheet,
  SheetOption,
} from '@/ui';
import { formatDateTime, formatInr } from '@/lib/format';

type NextMove = WorkflowTransition & { toStatus: WorkflowStatus };

/**
 * A step back along an arrow that already exists.
 *
 * Kept apart from the ordinary moves rather than mixed in with them: going
 * back is not part of the journey the shop drew, and it should never be one
 * click away from the move somebody meant to make.
 */
type BackMove = { transitionId: string; toStatus: WorkflowStatus };

/** What each GST treatment means, in the words the shop would use. */
const TREATMENT_LABEL: Record<string, string> = {
  EXCLUSIVE: 'GST charged on top',
  INCLUSIVE: 'GST included in the quote',
  ABSORBED: 'GST absorbed — client pays the quoted figure',
};

const TREATMENT_BLURB: Record<string, string> = {
  EXCLUSIVE: 'The quote is before tax; the client pays it plus GST.',
  INCLUSIVE: 'The quote is what they pay; the GST is already inside it.',
  ABSORBED:
    'For a client who cannot take a GST bill. They pay exactly what was quoted and the tax comes out of that, so the order total drops and what has already been collected may now settle it.',
};

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Shell>
      <OrderDetail orderId={id} />
    </Shell>
  );
}

function OrderDetail({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const [unit, setUnit] = useState<LengthUnit>('FT');

  const order = useApi<Order>(() => api.order(orderId, unit), [orderId, unit]);

  const [moves, setMoves] = useState<NextMove[]>([]);
  const [backMoves, setBackMoves] = useState<BackMove[]>([]);
  const [pendingBack, setPendingBack] = useState<BackMove | null>(null);
  const [moveSheet, setMoveSheet] = useState(false);
  const [pending, setPending] = useState<NextMove | null>(null);
  const [note, setNote] = useState('');
  const [termsSheet, setTermsSheet] = useState(false);
  const [priceSheet, setPriceSheet] = useState(false);
  const [quoted, setQuoted] = useState('');
  /** Which attachment is open over the page, if any. */
  const [viewing, setViewing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openMoves = useCallback(async () => {
    if (!order.data) return;
    setMoves(await api.allowedNext(order.data.status.id));
    // Only asked for by somebody who could act on the answer.
    setBackMoves(
      can(PERMISSIONS.ORDER_MOVE_BACK) ? await api.allowedBack(order.data.status.id) : [],
    );
    setMoveSheet(true);
  }, [order.data, can]);

  /** Send it back a stage. The server asks for the same acknowledgement. */
  const moveBack = async (target: BackMove, withNote?: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.changeOrderStatus(orderId, {
        toStatusId: target.toStatus.id,
        note: withNote,
        reverse: true,
      });
      setMoveSheet(false);
      setPendingBack(null);
      setNote('');
      order.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move it back');
    } finally {
      setBusy(false);
    }
  };

  const move = async (transition: NextMove, withNote?: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.changeOrderStatus(orderId, {
        toStatusId: transition.toStatusId,
        note: withNote,
      });
      setMoveSheet(false);
      setPending(null);
      setNote('');
      order.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move it');
    } finally {
      setBusy(false);
    }
  };

  if (order.loading) return <Loader label="Loading order" />;
  const data = order.data;
  if (!data) return null;

  /* Sizes first: they are what somebody opening an order is usually after. */
  const viewable = [
    ...(data.attachments ?? []).filter((a) => a.kind === 'SIZE_IMAGE'),
    ...(data.attachments ?? []).filter((a) => a.kind === 'REFERENCE_IMAGE'),
  ];

  return (
    <>
      {/* The heading, the stage it is at and the way to move it stay put: an
          order with its items, its money and its history under it is long
          enough that all three were a scroll back to the top away. */}
      <div className="sticky-bar">
        <PageHead
          title={data.code}
          subtitle={`${data.client.name} · ${data.location}`}
          action={
            <div className="row">
              <Pill label={data.status.name} color={data.status.color} />
              {can(PERMISSIONS.ORDER_MOVE_STATUS) ? (
                <Button title="Move status" icon="arrowUpRight" onClick={openMoves} />
              ) : null}
            </div>
          }
        />
      </div>

      {error ? (
        <Card size="sm" style={{ marginBottom: 'var(--s-lg)' }}>
          <span className="t-small danger">{error}</span>
        </Card>
      ) : null}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card>
          <div className="row-between" style={{ marginBottom: 'var(--s-md)' }}>
            <span className="t-label muted">Items</span>
            <div className="wrap">
              {LENGTH_UNITS.map((option) => (
                <Chip
                  key={option}
                  label={UNIT_LABEL[option]}
                  selected={unit === option}
                  onClick={() => setUnit(option)}
                />
              ))}
            </div>
          </div>

          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  <th>Size</th>
                  <th>Material</th>
                  <th>Thickness</th>
                  <th className="num">Qty</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="faint">{index + 1}</td>
                    <td>
                      <span className="bold">
                        {item.display
                          ? `${item.display.length} × ${item.display.width} ${UNIT_LABEL[item.display.unit]}`
                          : '—'}
                      </span>
                      {/* Redundant when the sheet is already being read in mm. */}
                      {unit === 'MM' ? null : (
                        <div className="t-tiny faint">
                          {Number(item.lengthMm)} × {Number(item.widthMm)} mm stored
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          marginRight: 7,
                          background: item.material.color ?? 'var(--text-faint)',
                        }}
                      />
                      {item.material.name}
                    </td>
                    <td className="muted">
                      {item.display?.thickness
                        ? `${item.display.thickness} ${UNIT_LABEL[item.display.thicknessUnit]}`
                        : '—'}
                    </td>
                    <td className="num accent bold">{item.quantity}</td>
                    <td className="num">
                      {Number(item.amount) > 0 ? formatInr(item.amount) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="stack-lg">
          {Number(data.grandTotal) > 0 ? (
            <Card
              // Production sees no money, and the API refuses them the ledger,
              // so the way in is not offered either.
              onClick={
                can(PERMISSIONS.PAYMENT_VIEW)
                  ? () => router.push(`/orders/${orderId}/payments`)
                  : undefined
              }>
              <div className="row-between" style={{ marginBottom: 'var(--s-md)' }}>
                <span className="t-label muted">Money</span>
                <Pill
                  label={data.paymentStatus}
                  color={
                    data.paymentStatus === 'RECEIVED'
                      ? 'var(--success)'
                      : data.paymentStatus === 'PARTIAL'
                        ? 'var(--warning)'
                        : 'var(--danger)'
                  }
                />
              </div>
              <table className="table table-plain">
                <tbody>
                  <tr>
                    <td className="muted">Taxable</td>
                    <td className="num bold">{formatInr(data.total)}</td>
                  </tr>
                  <tr>
                    <td className="muted">GST</td>
                    <td className="num bold">{formatInr(data.taxAmount)}</td>
                  </tr>
                  <tr>
                    <td className="muted">Client pays</td>
                    <td className="num accent bold">{formatInr(data.grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="row-between" style={{ marginTop: 'var(--s-md)' }}>
                <span className="t-tiny faint">{TREATMENT_LABEL[data.taxTreatment]}</span>
                <Icon name="chevronRight" size={14} color="var(--text-faint)" />
              </div>
            </Card>
          ) : (
            /*
             * An order can be punched before it is quoted, so it can legitimately
             * be worth nothing yet. Hiding the money block in that case left no
             * way to price it and no way to reach payments — the order was a dead
             * end until somebody edited it elsewhere.
             */
            <Card
              onClick={can(PERMISSIONS.ORDER_TERMS) ? () => setPriceSheet(true) : undefined}>
              <div className="row-between">
                <div>
                  <div className="t-label muted">Not priced yet</div>
                  <div className="t-tiny faint">
                    {can(PERMISSIONS.ORDER_TERMS)
                      ? 'Set what was quoted, then payments can be recorded against it.'
                      : 'Nothing can be collected until somebody prices it.'}
                  </div>
                </div>
                {can(PERMISSIONS.ORDER_TERMS) ? (
                  <Icon name="chevronRight" size={14} color="var(--text-faint)" />
                ) : null}
              </div>
            </Card>
          )}

          {can(PERMISSIONS.ORDER_TERMS) && Number(data.grandTotal) > 0 ? (
            <Card size="sm" onClick={() => setTermsSheet(true)}>
              <div className="row-between">
                <div>
                  <div className="t-label muted">GST treatment</div>
                  <div className="t-tiny faint">
                    {TREATMENT_LABEL[data.taxTreatment]}
                    {Number(data.taxDiscount) > 0
                      ? ` · ${formatInr(data.taxDiscount)} absorbed`
                      : ''}
                  </div>
                </div>
                <Icon name="chevronRight" size={14} color="var(--text-faint)" />
              </div>
            </Card>
          ) : null}

          {can(PERMISSIONS.DISBURSEMENT_VIEW) ? (
            <Card size="sm" onClick={() => router.push(`/orders/${orderId}/disbursements`)}>
              <div className="row-between">
                <div>
                  <div className="t-label muted">Payouts</div>
                  <div className="t-tiny faint">
                    What this order owes other people. Kept separate from the order total.
                  </div>
                </div>
                <Icon name="chevronRight" size={14} color="var(--text-faint)" />
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      {viewable.length ? (
        <>
          <SectionHead title="Attachments" />
          <div className="thumb-strip">
            {viewable.map((attachment, position) => (
              <button
                type="button"
                key={attachment.id}
                className="thumb-tile"
                data-testid={`attachment-${attachment.id}`}
                onClick={() => setViewing(position)}>
                {/* The API serves files behind a token, so the thumbnail is the
                    same fetched blob the viewer uses. */}
                <ThumbImage url={api.fileUrl(attachment.file.id)} token={api.getToken()} />
                <span className="t-micro faint truncate">
                  {attachment.kind === 'SIZE_IMAGE'
                    ? 'Size'
                    : (attachment.description ?? 'Reference')}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      <ImageViewer
        images={viewable.map((attachment) => ({
          id: attachment.id,
          url: api.fileUrl(attachment.file.id),
          caption:
            attachment.kind === 'SIZE_IMAGE'
              ? 'Size'
              : (attachment.description ?? 'Reference'),
        }))}
        index={viewing}
        token={api.getToken()}
        onClose={() => setViewing(null)}
      />

      <SectionHead title="History" />
      <Card size="sm" className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 170 }}>When</th>
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
        title="Move this order"
        subtitle={`From ${data.status.name}`}
        onClose={() => {
          setMoveSheet(false);
          setPending(null);
          setPendingBack(null);
          setNote('');
        }}>
        {pendingBack ? (
          <>
            {/*
              The question, asked in full. This move is not on the flow the
              shop drew, so it says so and names both ends rather than being a
              bare "are you sure?".
            */}
            <p className="t-body" style={{ marginTop: 0 }}>
              <span className="bold">{data.status.name}</span> →{' '}
              <span className="bold warning">{pendingBack.toStatus.name}</span> is not a step
              this flow draws.
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

      <Sheet
        open={priceSheet}
        title="What was quoted?"
        subtitle="Recorded as one agreed figure for the whole order"
        onClose={() => setPriceSheet(false)}>
        <p className="t-small muted" style={{ marginTop: 0 }}>
          The floor can price the individual lines later. This is the figure the
          client agreed to, and it is what payments are collected against.
        </p>
        <Field
          label="Amount (₹)"
          placeholder="0"
          value={quoted}
          onChange={setQuoted}
          pasteable={false}
        />
        <Button
          title="Set the price"
          loading={busy}
          disabled={!quoted || Number(quoted) <= 0}
          onClick={async () => {
            setBusy(true);
            try {
              await api.repriceOrder(orderId, {
                pricingMode: 'LUMP_SUM',
                total: Number(quoted),
              });
              setPriceSheet(false);
              setQuoted('');
              order.reload();
            } finally {
              setBusy(false);
            }
          }}
        />
      </Sheet>

      <Sheet
        open={termsSheet}
        title="GST treatment"
        subtitle="Re-prices every line from the rate it was quoted at"
        onClose={() => setTermsSheet(false)}>
        {(['EXCLUSIVE', 'INCLUSIVE', 'ABSORBED'] as TaxTreatment[]).map((treatment) => (
          <SheetOption
            key={treatment}
            label={TREATMENT_LABEL[treatment]}
            description={TREATMENT_BLURB[treatment]}
            selected={data.taxTreatment === treatment}
            onClick={async () => {
              if (data.taxTreatment === treatment) return setTermsSheet(false);
              setBusy(true);
              try {
                await api.repriceOrder(orderId, { taxTreatment: treatment });
                setTermsSheet(false);
                order.reload();
              } finally {
                setBusy(false);
              }
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

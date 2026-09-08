import React, { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import type { HistoryEntry, Order, WorkflowStatus, WorkflowTransition } from '@decor/shared';
import { LENGTH_UNITS, PERMISSIONS, UNIT_LABEL } from '@decor/shared';
import type { TaxTreatment } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useDisplayUnit } from '../hooks/useUnit';
import { useAuth } from '../auth/AuthContext';
import {
  AccentSurface,
  Button,
  Card,
  DataTable,
  Chip,
  Field,
  ImageViewer,
  Icon,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Sheet,
  SheetOption,
  Text,
  haptic,
} from '../ui';
import { HistoryTimeline } from '../components/HistoryTimeline';
import { palette, radius, spacing } from '../theme';
import { formatInr, relativeTime } from '../lib/format';

/** What each GST treatment means, in the words the shop would use. */
const TAX_TREATMENT_LABEL: Record<string, string> = {
  EXCLUSIVE: 'GST charged on top',
  INCLUSIVE: 'GST included in the quote',
  ABSORBED: 'GST absorbed — client pays the quoted figure',
};

const TAX_TREATMENT_BLURB: Record<string, string> = {
  EXCLUSIVE: 'The quote is before tax; the client pays it plus GST.',
  INCLUSIVE: 'The quote is what they pay; the GST is already inside it.',
  ABSORBED:
    'For a client who cannot take a GST bill. They pay exactly what was quoted, and the tax comes out of that — so the order total drops and what has already been collected may now settle it.',
};

/** How a rate was quoted, in the words the shop used. */
const RATE_LABEL: Record<string, string> = {
  PER_SQFT: 'per sq ft',
  PER_SQM: 'per sq m',
  PER_PIECE: 'per piece',
  PER_RFT: 'per r ft',
  LUMP_SUM: 'lump sum',
};

type NextMove = WorkflowTransition & { toStatus: WorkflowStatus };

/**
 * A step back along an arrow that already exists.
 *
 * Kept apart from the ordinary moves rather than mixed in with them: going
 * back is not part of the journey the shop drew, and it should never be one
 * tap away from the move somebody meant to make.
 */
type BackMove = { transitionId: string; toStatus: WorkflowStatus };

/**
 * One order.
 *
 * The order itself is rendered as a lime card — the same visual weight the home
 * screen gives the pipeline figure — because on this screen it is the subject.
 * Status moves come from the workflow, so the buttons here are exactly the
 * moves the admin drew and nothing else.
 */
export function OrderDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const { orderId, justPunched } = route.params as { orderId: string; justPunched?: boolean };
  const [unit, setUnit] = useDisplayUnit();
  const { can } = useAuth();
  const canMoveBack = can(PERMISSIONS.ORDER_MOVE_BACK);
  const [termsSheet, setTermsSheet] = useState(false);
  const [priceSheet, setPriceSheet] = useState(false);
  const [quoted, setQuoted] = useState('');
  /** Which attachment is open full screen, if any. */
  const [viewing, setViewing] = useState<number | null>(null);
  const [repricing, setRepricing] = useState(false);
  const [moves, setMoves] = useState<NextMove[]>([]);
  const [backMoves, setBackMoves] = useState<BackMove[]>([]);
  const [pendingBack, setPendingBack] = useState<BackMove | null>(null);
  const [moveSheet, setMoveSheet] = useState(false);
  const [pendingMove, setPendingMove] = useState<NextMove | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  /*
   * The history is its own request rather than part of the order.
   *
   * It is no longer only the stages this order passed through — it holds the
   * line whose rate was corrected and the money taken against it, which come
   * from the trail rather than from the order row.
   */
  const history = useApi<HistoryEntry[]>(
    useCallback(() => api.history('orders', orderId), [orderId]),
    [orderId],
  );

  const order = useApi<Order>(
    useCallback(async () => {
      const fresh = await api.order(orderId, unit);
      setMoves(await api.allowedNext(fresh.status.id));
      // Only asked for by somebody who could act on the answer.
      setBackMoves(
        canMoveBack ? await api.allowedBack(fresh.status.id) : [],
      );
      return fresh;
    }, [orderId, unit, canMoveBack]),
    [orderId, unit, canMoveBack],
  );

  /** Send it back a stage. The server asks for the same acknowledgement. */
  const moveBack = async (target: BackMove, withNote?: string) => {
    setBusy(true);
    try {
      await api.changeOrderStatus(orderId, {
        toStatusId: target.toStatus.id,
        note: withNote,
        reverse: true,
      });
      haptic('notificationSuccess');
      setMoveSheet(false);
      setPendingBack(null);
      setNote('');
      order.reload();
      history.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not move it back', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const move = async (target: NextMove, withNote?: string) => {
    setBusy(true);
    try {
      await api.changeOrderStatus(orderId, { toStatusId: target.toStatusId, note: withNote });
      haptic('notificationSuccess');
      setMoveSheet(false);
      setPendingMove(null);
      setNote('');
      order.reload();
      history.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not move', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!order.data) return <Loader />;

  const data = order.data;
  const references = data.attachments.filter((a) => a.kind === 'REFERENCE_IMAGE');
  const sizeImages = data.attachments.filter((a) => a.kind === 'SIZE_IMAGE');
  /* Sizes first: they are what somebody opening an order is usually after. */
  const viewable = [...sizeImages, ...references];

  return (
    <Screen
      refreshing={order.refreshing}
      onRefresh={order.refresh}
      /* The heading stays put, as it does on the lists and on an enquiry: an
         order with its items, its money and its history under it is long
         enough that the way back was a scroll away. */
      sticky={
        <ScreenHeader
          title={data.code}
          subtitle={relativeTime(data.createdAt)}
          onBack={() => navigation.goBack()}
        />
      }>
      {justPunched ? (
        <Animated.View entering={ZoomIn.duration(400).springify()} style={[styles.punchedBanner, { backgroundColor: palette.accent }]}>
          <Icon name="check" size={16} color={palette.textOnAccent} />
          <Text variant="small" tone="onAccent" bold style={{ marginLeft: spacing.sm }}>
            Punched — it is on the board now
          </Text>
        </Animated.View>
      ) : null}

      {/* The order rendered as a physical card. */}
      <Animated.View entering={FadeInDown.duration(420).springify()}>
        <AccentSurface contentStyle={styles.orderCard}>
          <View style={styles.orderCardTop}>
            {/* minWidth 0 lets the name actually ellipsize; without it a long
                client name pushes the status pill off the card. */}
            <View style={styles.orderCardTitle}>
              <Text variant="h2" tone="onAccent" numberOfLines={2}>{data.client.name}</Text>
              <Text variant="small" tone="onAccent" style={{ opacity: 0.72 }} numberOfLines={1}>
                {data.location}
              </Text>
            </View>
            <View style={styles.orderCardPill}>
              <Pill label={data.status.name} color={palette.textOnAccent} small />
            </View>
          </View>

          <View style={styles.orderCardBottom}>
            <View>
              <Text variant="micro" tone="onAccent" style={{ opacity: 0.6 }}>ORDER</Text>
              <Text variant="h3" tone="onAccent">{data.code}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="micro" tone="onAccent" style={{ opacity: 0.6 }}>ITEMS</Text>
              <Text variant="h3" tone="onAccent">{data.items.length}</Text>
            </View>
            {data.priority !== 'NORMAL' ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="micro" tone="onAccent" style={{ opacity: 0.6 }}>PRIORITY</Text>
                <Text variant="h3" tone="onAccent">{data.priority}</Text>
              </View>
            ) : null}
          </View>
        </AccentSurface>
      </Animated.View>

      <View style={styles.unitRow}>
        <Text variant="label" tone="faint">Show in</Text>
        {LENGTH_UNITS.map((u) => (
          <Chip key={u} label={UNIT_LABEL[u]} selected={unit === u} onPress={() => setUnit(u)} />
        ))}
      </View>

      <Card tone="dark" style={{ marginBottom: spacing.md }}>
        <DataTable
          minWidth={520}
          rows={data.items}
          empty="No lines on this order"
          columns={[
            {
              key: 'line',
              header: '#',
              flex: 0.4,
              render: (item) => (
                <Text variant="small" tone="faint">{item.lineNo}</Text>
              ),
            },
            {
              key: 'size',
              header: 'Size',
              flex: 2,
              render: (item) => (
                <>
                  <Text variant="small" bold>
                    {item.display
                      ? `${item.display.length} × ${item.display.width} ${UNIT_LABEL[item.display.unit]}`
                      : '—'}
                  </Text>
                  {/* Redundant when the sheet is already being read in mm. */}
                  {unit === 'MM' ? null : (
                    <Text variant="tiny" tone="faint">
                      {Number(item.lengthMm)} × {Number(item.widthMm)} mm
                    </Text>
                  )}
                </>
              ),
            },
            {
              key: 'material',
              header: 'Material',
              flex: 1.8,
              render: (item) => (
                <View style={styles.cellMeta}>
                  <View
                    style={[
                      styles.materialDot,
                      { backgroundColor: item.material.color ?? palette.textFaint },
                    ]}
                  />
                  <Text variant="small" tone="muted" numberOfLines={1}>
                    {item.material.name}
                  </Text>
                </View>
              ),
            },
            {
              key: 'thickness',
              header: 'Thick',
              flex: 1,
              render: (item) => (
                <Text variant="small" tone="muted">
                  {item.display?.thickness
                    ? `${item.display.thickness} ${UNIT_LABEL[item.display.thicknessUnit]}`
                    : '—'}
                </Text>
              ),
            },
            {
              key: 'qty',
              header: 'Qty',
              flex: 0.6,
              align: 'right',
              render: (item) => (
                <Text variant="small" tone="accent" bold>{item.quantity}</Text>
              ),
            },
            {
              key: 'amount',
              header: 'Amount',
              flex: 1.4,
              align: 'right',
              render: (item) =>
                Number(item.amount) > 0 ? (
                  <>
                    <Text variant="small" bold>{formatInr(Number(item.amount))}</Text>
                    {item.rate ? (
                      <Text variant="tiny" tone="faint">
                        ₹{Number(item.rate)} {RATE_LABEL[item.rateUnit] ?? ''}
                      </Text>
                    ) : null}
                    {Number(item.taxAmount) > 0 ? (
                      <Text variant="tiny" tone="faint">
                        +{formatInr(Number(item.taxAmount))} GST
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text variant="small" tone="faint">—</Text>
                ),
            },
          ]}
        />
      </Card>

      {moves.length || backMoves.length ? (
        <Button
          title="Move status"
          variant="primary"
          size="lg"
          icon={<Icon name="arrowUpRight" size={18} color={palette.textOnAccent} />}
          onPress={() => setMoveSheet(true)}
          style={{ marginTop: spacing.lg }}
        />
      ) : (
        <Card tone="dark" style={{ marginTop: spacing.lg }}>
          <Text variant="small" tone="muted">
            No moves are allowed from {data.status.name}. An admin can add one on the status flow.
          </Text>
        </Card>
      )}

      {Number(data.grandTotal) > 0 ? (
        <Card
          tone="dark"
          style={{ marginTop: spacing.md }}
          // Production sees no money, and the API refuses them the ledger, so
          // the way in is not offered either.
          onPress={
            can(PERMISSIONS.PAYMENT_VIEW)
              ? () => navigation.navigate('Payments', { orderId, orderCode: data.code })
              : undefined
          }>
          <View style={styles.moneyHead}>
            <Text variant="label" tone="muted">Money</Text>
            <Pill
              label={data.paymentStatus}
              color={
                data.paymentStatus === 'RECEIVED'
                  ? palette.success
                  : data.paymentStatus === 'PARTIAL'
                    ? palette.warning
                    : palette.danger
              }
              small
            />
          </View>
          <View style={styles.moneyRow}>
            <View>
              <Text variant="tiny" tone="muted">Taxable</Text>
              <Text variant="body" bold>{formatInr(Number(data.total))}</Text>
            </View>
            <View>
              <Text variant="tiny" tone="muted">GST</Text>
              <Text variant="body" bold>{formatInr(Number(data.taxAmount))}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="tiny" tone="muted">Client pays</Text>
              <Text variant="h3" tone="accent">{formatInr(Number(data.grandTotal))}</Text>
            </View>
          </View>
          <View style={styles.moneyFoot}>
            <Text variant="tiny" tone="faint">
              {TAX_TREATMENT_LABEL[data.taxTreatment] ?? ''} · tap to record or review payments
            </Text>
            <Icon name="chevronRight" size={14} color={palette.textFaint} />
          </View>
        </Card>
      ) : (
        /*
         * An order can be punched before it is quoted, so it can legitimately be
         * worth nothing yet. Hiding the money block entirely in that case left
         * no way to price it and no way to reach payments — the order was a
         * dead end until somebody edited it elsewhere.
         */
        <Card
          tone="dark"
          style={{ marginTop: spacing.md }}
          onPress={can(PERMISSIONS.ORDER_TERMS) ? () => setPriceSheet(true) : undefined}>
          <View style={styles.moneyFootFlush}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="label" tone="muted">Not priced yet</Text>
              <Text variant="tiny" tone="faint">
                {can(PERMISSIONS.ORDER_TERMS)
                  ? 'Set what was quoted, then payments can be recorded against it.'
                  : 'Nothing can be collected until somebody prices it.'}
              </Text>
            </View>
            {can(PERMISSIONS.ORDER_TERMS) ? (
              <Icon name="chevronRight" size={14} color={palette.textFaint} />
            ) : null}
          </View>
        </Card>
      )}

      {can(PERMISSIONS.ORDER_TERMS) && Number(data.grandTotal) > 0 ? (
        <Card
          tone="dark"
          style={{ marginTop: spacing.md }}
          onPress={() => setTermsSheet(true)}>
          <View style={styles.moneyFootFlush}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="label" tone="muted">GST treatment</Text>
              <Text variant="tiny" tone="faint">
                {TAX_TREATMENT_LABEL[data.taxTreatment]}
                {Number(data.taxDiscount) > 0
                  ? ` · ${formatInr(Number(data.taxDiscount))} absorbed`
                  : ''}
              </Text>
            </View>
            <Icon name="chevronRight" size={14} color={palette.textFaint} />
          </View>
        </Card>
      ) : null}

      {can(PERMISSIONS.INVOICE_VIEW) && Number(data.grandTotal) > 0 ? (
        <Card
          tone="dark"
          style={{ marginTop: spacing.md }}
          onPress={() =>
            navigation.navigate('OrderInvoice', { orderId, orderCode: data.code })
          }>
          <View style={styles.moneyFootFlush}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="label" tone="muted">Invoice and challans</Text>
              <Text variant="tiny" tone="faint">
                The bill for this job, and the paper that went out with the goods.
              </Text>
            </View>
            <Icon name="chevronRight" size={14} color={palette.textFaint} />
          </View>
        </Card>
      ) : null}

      {can(PERMISSIONS.DISBURSEMENT_VIEW) && Number(data.grandTotal) > 0 ? (
        <Card
          tone="dark"
          style={{ marginTop: spacing.md }}
          onPress={() =>
            navigation.navigate('Disbursements', { orderId, orderCode: data.code })
          }>
          <View style={styles.moneyFootFlush}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="label" tone="muted">Payouts</Text>
              <Text variant="tiny" tone="faint">
                What this order owes other people. Kept separate from the order total.
              </Text>
            </View>
            <Icon name="chevronRight" size={14} color={palette.textFaint} />
          </View>
        </Card>
      ) : null}

      <Button
        title="Add photos"
        variant="dark"
        icon={<Icon name="camera" size={18} color={palette.text} />}
        onPress={() => navigation.navigate('OrderPhotos', { orderId })}
        style={{ marginTop: spacing.md }}
      />

      {references.length || sizeImages.length ? (
        <>
          <Text variant="label" tone="muted" style={styles.blockLabel}>Attachments</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {viewable.map((attachment, position) => (
              <Pressable
                key={attachment.id}
                style={styles.thumb}
                testID={`attachment-${attachment.id}`}
                onPress={() => setViewing(position)}>
                <Image
                  source={{
                    uri: api.fileUrl(attachment.file.id),
                    headers: { Authorization: `Bearer ${api.getToken()}` },
                  }}
                  style={styles.thumbImage}
                />
                <Text variant="micro" tone="faint" numberOfLines={1} style={{ marginTop: 4 }}>
                  {attachment.kind === 'SIZE_IMAGE' ? 'Size' : attachment.description ?? 'Reference'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      <Text variant="label" tone="muted" style={styles.blockLabel}>History</Text>
      <Card tone="dark" style={styles.historyCard}>
        <HistoryTimeline entries={history.data ?? []} />
      </Card>

      <Sheet
        visible={moveSheet}
        title="Move this order"
        subtitle={`Currently ${data.status.name}`}
        onClose={() => {
          setMoveSheet(false);
          setPendingMove(null);
          setPendingBack(null);
          setNote('');
        }}>
        {pendingBack ? (
          <Animated.View entering={FadeIn.duration(200)}>
            {/*
              The question, asked in full. This move is not on the flow the
              shop drew, so it says so and names both ends rather than being a
              bare "are you sure?".
            */}
            <Text variant="body" style={{ marginBottom: spacing.sm }}>
              <Text bold>{data.status.name}</Text> →{' '}
              <Text bold tone="warning">{pendingBack.toStatus.name}</Text> is not a step
              this flow draws.
            </Text>
            <Text variant="small" tone="muted" style={{ marginBottom: spacing.md }}>
              {data.code} would go back a stage. It is recorded as a reversal, with your
              name on it. Are you sure?
            </Text>
            <Field
              label="Why is it going back?"
              placeholder="A note for whoever reads this later"
              value={note}
              onChangeText={setNote}
              autoFocus
            />
            <Button
              title="Yes, move it back"
              loading={busy}
              onPress={() => moveBack(pendingBack, note.trim() || undefined)}
            />
            <Button
              title="Leave it where it is"
              variant="dark"
              onPress={() => {
                setPendingBack(null);
                setNote('');
              }}
              style={{ marginTop: spacing.sm }}
            />
          </Animated.View>
        ) : pendingMove ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <Text variant="body" style={{ marginBottom: spacing.md }}>
              Moving to <Text bold tone="accent">{pendingMove.toStatus.name}</Text> needs a note.
            </Text>
            <Field
              label="Why?"
              placeholder="Explain the move"
              value={note}
              onChangeText={setNote}
              autoFocus
            />
            <Button
              title="Confirm move"
              loading={busy}
              disabled={!note.trim()}
              onPress={() => move(pendingMove, note.trim())}
            />
          </Animated.View>
        ) : (
          <>
            {moves.map((m) => (
              <SheetOption
                key={m.id}
                label={m.label ?? m.toStatus.name}
                description={
                  m.requiresNote ? 'Needs a note' : `Move to ${m.toStatus.name}`
                }
                accent={m.toStatus.color}
                onPress={() => (m.requiresNote ? setPendingMove(m) : move(m))}
              />
            ))}

            {backMoves.length ? (
              <>
                <Text variant="label" tone="muted" style={styles.backHead}>
                  Not the usual journey
                </Text>
                {backMoves.map((b) => (
                  <SheetOption
                    key={b.transitionId}
                    label={`Back to ${b.toStatus.name}`}
                    description="Asks you to confirm first"
                    accent={b.toStatus.color}
                    onPress={() => setPendingBack(b)}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </Sheet>

      <ImageViewer
        images={viewable.map((attachment) => ({
          id: attachment.id,
          uri: api.fileUrl(attachment.file.id),
          headers: { Authorization: `Bearer ${api.getToken()}` },
          caption:
            attachment.kind === 'SIZE_IMAGE'
              ? 'Size'
              : (attachment.description ?? 'Reference'),
        }))}
        index={viewing}
        onClose={() => setViewing(null)}
      />

      <Sheet
        visible={priceSheet}
        title="What was quoted?"
        subtitle="Recorded as one agreed figure for the whole order"
        onClose={() => setPriceSheet(false)}>
        <Text variant="small" tone="muted" style={{ marginBottom: spacing.md }}>
          The floor can price the individual lines later. This is the figure the
          client agreed to, and it is what payments are collected against.
        </Text>
        <Field
          label="Amount (₹)"
          placeholder="0"
          value={quoted}
          onChangeText={setQuoted}
          keyboardType="decimal-pad"
          autoFocus
        />
        <Button
          title="Set the price"
          loading={repricing}
          disabled={!quoted || Number(quoted) <= 0}
          onPress={async () => {
            setRepricing(true);
            try {
              await api.repriceOrder(orderId, {
                pricingMode: 'LUMP_SUM',
                total: Number(quoted),
              });
              haptic('notificationSuccess');
              setPriceSheet(false);
              setQuoted('');
              order.reload();
              history.reload();
            } catch (e) {
              haptic('notificationError');
              Alert.alert(
                'Could not price it',
                e instanceof Error ? e.message : 'Unknown error',
              );
            } finally {
              setRepricing(false);
            }
          }}
        />
      </Sheet>

      <Sheet
        visible={termsSheet}
        title="GST treatment"
        subtitle="Re-prices every line from the rate it was quoted at"
        onClose={() => setTermsSheet(false)}>
        {(['EXCLUSIVE', 'INCLUSIVE', 'ABSORBED'] as TaxTreatment[]).map((treatment) => (
          <SheetOption
            key={treatment}
            label={TAX_TREATMENT_LABEL[treatment]}
            description={TAX_TREATMENT_BLURB[treatment]}
            selected={data.taxTreatment === treatment}
            onPress={async () => {
              if (data.taxTreatment === treatment) return setTermsSheet(false);
              setRepricing(true);
              try {
                await api.repriceOrder(orderId, { taxTreatment: treatment });
                haptic('notificationSuccess');
                setTermsSheet(false);
                order.reload();
                history.reload();
              } catch (e) {
                haptic('notificationError');
                Alert.alert(
                  'Could not change it',
                  e instanceof Error ? e.message : 'Unknown error',
                );
              } finally {
                setRepricing(false);
              }
            }}
          />
        ))}
        {repricing ? (
          <Text variant="tiny" tone="muted" style={{ marginTop: spacing.md }}>
            Re-pricing…
          </Text>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  punchedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    marginBottom: spacing.lg,
  },
  orderCard: { padding: spacing.xl },
  orderCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  orderCardTitle: { flex: 1, minWidth: 0 },
  orderCardPill: { flexShrink: 0 },
  orderCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  itemCard: { marginBottom: spacing.sm, padding: spacing.lg },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  itemMeta: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  /* The same row, without the margin that would push it out of a table cell. */
  cellMeta: { flexDirection: 'row', alignItems: 'center' },
  backHead: { marginTop: spacing.lg, marginBottom: spacing.sm },
  materialDot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.sm },
  blockLabel: { marginTop: spacing.xl, marginBottom: spacing.md },
  thumb: { width: 96, marginRight: spacing.md },
  thumbImage: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceLit,
  },
  historyCard: { padding: spacing.md },
  moneyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  moneyFootFlush: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  moneyFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  itemMoney: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.25)',
  },
});

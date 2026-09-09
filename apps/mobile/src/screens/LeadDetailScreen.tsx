import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type {
  CustomFieldDefinition,
  HistoryEntry,
  Lead,
  WorkflowStatus,
  WorkflowTransition,
} from '@fas/shared';
import { PERMISSIONS } from '@fas/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import {
  Avatar,
  Button,
  Card,
  Field,
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
import { palette, spacing } from '../theme';
import { formatDateTime, formatInr, relativeTime } from '../lib/format';

type NextMove = WorkflowTransition & { toStatus: WorkflowStatus };

/** A step back along an arrow that exists. See the order screen. */
type BackMove = { transitionId: string; toStatus: WorkflowStatus };

/** Where a quote stands, at a glance. */
function quoteColour(status: string): string {
  if (status === 'ACCEPTED' || status === 'CONVERTED') return palette.success;
  if (status === 'DECLINED' || status === 'EXPIRED') return palette.danger;
  if (status === 'SENT') return palette.accent;
  return palette.surfaceLit;
}

export function LeadDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const { leadId } = route.params as { leadId: string };
  const { can } = useAuth();
  const canMoveBack = can(PERMISSIONS.LEAD_MOVE_BACK);
  const [moves, setMoves] = useState<NextMove[]>([]);
  const [backMoves, setBackMoves] = useState<BackMove[]>([]);
  const [moveSheet, setMoveSheet] = useState(false);
  const [pendingMove, setPendingMove] = useState<NextMove | null>(null);
  const [pendingBack, setPendingBack] = useState<BackMove | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const fields = useApi<CustomFieldDefinition[]>(() => api.leadFields(), []);
  /*
   * The history is its own request: it is no longer only the stages this
   * enquiry passed through, but what was edited on it and by whom.
   */
  const history = useApi<HistoryEntry[]>(
    useCallback(() => api.history('leads', leadId), [leadId]),
    [leadId],
  );

  const lead = useApi<Lead>(
    useCallback(async () => {
      const fresh = await api.lead(leadId);
      setMoves(await api.allowedNext(fresh.status.id));
      setBackMoves(canMoveBack ? await api.allowedBack(fresh.status.id) : []);
      return fresh;
    }, [leadId, canMoveBack]),
    [leadId, canMoveBack],
  );

  /** Send it back a stage. The server asks for the same acknowledgement. */
  const moveBack = async (target: BackMove, withNote?: string) => {
    setBusy(true);
    try {
      await api.changeLeadStatus(leadId, {
        toStatusId: target.toStatus.id,
        note: withNote,
        reverse: true,
      });
      haptic('notificationSuccess');
      setMoveSheet(false);
      setPendingBack(null);
      setNote('');
      lead.reload();
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
      await api.changeLeadStatus(leadId, { toStatusId: target.toStatusId, note: withNote });
      haptic('notificationSuccess');
      setMoveSheet(false);
      setPendingMove(null);
      setNote('');
      lead.reload();
      history.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not move', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!lead.data) return <Loader />;
  const data = lead.data;

  return (
    <Screen
      refreshing={lead.refreshing}
      onRefresh={lead.refresh}
      /* The heading stays put, as it does on the lists: an enquiry with its
         quotes and its history under it is long enough that the way back was
         a scroll away. */
      sticky={
        <ScreenHeader
          title={data.code}
          subtitle={relativeTime(data.createdAt)}
          onBack={() => navigation.goBack()}
        />
      }>
      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <Text variant="h1" tone="onAccent">{data.title}</Text>
          {data.estimatedValue ? (
            <Text variant="h2" tone="onAccent" style={{ opacity: 0.8, marginTop: spacing.xs }}>
              {formatInr(Number(data.estimatedValue))}
            </Text>
          ) : null}
          <View style={styles.heroFoot}>
            <Pill label={data.status.name} color={palette.textOnAccent} small />
            {data.source ? (
              <Text variant="tiny" tone="onAccent" style={{ opacity: 0.75 }}>
                via {data.source.name}
              </Text>
            ) : null}
          </View>
        </Card>
      </Animated.View>

      <Card tone="dark" style={styles.block}>
        <View style={styles.contactRow}>
          <Avatar name={data.contactName ?? data.client?.name ?? data.title} size={44} tone="dark" />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text variant="body" bold>
              {data.contactName ?? data.client?.name ?? 'No contact yet'}
            </Text>
            <Text variant="tiny" tone="muted">
              {data.client ? `${data.client.code} · existing client` : 'not yet a client'}
            </Text>
          </View>
        </View>
        {data.contactPhone ? <Row label="Phone" value={data.contactPhone} /> : null}
        {data.company ? <Row label="Company" value={data.company} /> : null}
        {data.location ? <Row label="Location" value={data.location} /> : null}
        {data.owner ? <Row label="Owner" value={data.owner.name} /> : null}
      </Card>

      {fields.data?.length ? (
        <Card tone="dark" style={styles.block}>
          <Text variant="label" tone="muted" style={{ marginBottom: spacing.md }}>Details</Text>
          {fields.data.map((field) => {
            const value = data.customFields?.[field.key];
            if (value === undefined || value === null || value === '') return null;
            return (
              <Row
                key={field.id}
                label={field.label}
                value={
                  typeof value === 'boolean'
                    ? value ? 'Yes' : 'No'
                    : Array.isArray(value)
                      ? value.join(', ')
                      : String(value)
                }
              />
            );
          })}
        </Card>
      ) : null}

      {data.convertedOrder ? (
        <Card
          tone="dark"
          style={{ ...styles.block, borderColor: palette.success }}
          onPress={() => navigation.navigate('OrderDetail', { orderId: data.convertedOrder!.id })}>
          <View style={styles.contactRow}>
            <Icon name="check" size={20} color={palette.success} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text variant="body" bold>Converted</Text>
              <Text variant="tiny" tone="muted">
                {data.convertedOrder.code} · {formatDateTime(data.convertedAt)}
              </Text>
            </View>
            <Icon name="chevronRight" size={16} color={palette.textMuted} />
          </View>
        </Card>
      ) : (
        <Button
          title="Convert to order"
          size="lg"
          icon={<Icon name="arrowUpRight" size={18} color={palette.textOnAccent} />}
          onPress={() => navigation.navigate('LeadConvert', { leadId })}
          style={{ marginTop: spacing.lg }}
        />
      )}

      {can(PERMISSIONS.ESTIMATE_MANAGE) && !data.convertedOrder ? (
        <Button
          title="Quote this enquiry"
          variant="dark"
          icon={<Icon name="tag" size={17} color={palette.text} />}
          onPress={() =>
            navigation.navigate('EstimateEdit', {
              lead: {
                id: data.id,
                code: data.code,
                title: data.title,
                clientId: data.client?.id ?? null,
                clientName: data.client?.name ?? data.contactName ?? null,
                location: data.location ?? null,
              },
            })
          }
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      {moves.length || backMoves.length ? (
        <Button
          title="Move stage"
          variant="dark"
          onPress={() => setMoveSheet(true)}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      {/*
        What has been quoted for this enquiry.
        The board's figure comes from these, so it is worth being able to see
        which quote it came from and where that quote stands.
      */}
      {data.estimates?.length ? (
        <>
          <Text variant="label" tone="muted" style={styles.blockLabel}>Quotes</Text>
          {data.estimates.map((estimate) => (
            <Card
              key={estimate.id}
              tone="dark"
              style={{ marginBottom: spacing.sm }}
              onPress={() =>
                navigation.navigate('EstimateDetail', { estimateId: estimate.id })
              }>
              <View style={styles.contactRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="body" bold>{estimate.code}</Text>
                  <Text variant="tiny" tone="faint">
                    {formatDateTime(estimate.issuedOn)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="body" bold tone="accent">
                    {formatInr(Number(estimate.grandTotal))}
                  </Text>
                  <Pill label={estimate.status} color={quoteColour(estimate.status)} small />
                </View>
              </View>
            </Card>
          ))}
        </>
      ) : null}

      <Text variant="label" tone="muted" style={styles.blockLabel}>History</Text>
      <HistoryTimeline entries={history.data ?? []} />

      <Sheet
        visible={moveSheet}
        title="Move this lead"
        subtitle={`Currently ${data.status.name}`}
        onClose={() => {
          setMoveSheet(false);
          setPendingMove(null);
          setPendingBack(null);
          setNote('');
        }}>
        {pendingBack ? (
          <View>
            <Text variant="body" style={{ marginBottom: spacing.sm }}>
              <Text bold>{data.status.name}</Text> →{' '}
              <Text bold tone="warning">{pendingBack.toStatus.name}</Text> is not a step
              this pipeline draws.
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
          </View>
        ) : pendingMove ? (
          <View>
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
              title="Confirm"
              loading={busy}
              disabled={!note.trim()}
              onPress={() => move(pendingMove, note.trim())}
            />
          </View>
        ) : (
          <>
            {moves.map((m) => (
              <SheetOption
                key={m.id}
                label={m.label ?? m.toStatus.name}
                description={m.requiresNote ? 'Needs a note' : undefined}
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
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="small" tone="muted">{label}</Text>
      <Text variant="small" bold style={{ flex: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  block: { marginTop: spacing.md },
  contactRow: { flexDirection: 'row', alignItems: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  blockLabel: { marginTop: spacing.xl, marginBottom: spacing.md },
  backHead: { marginTop: spacing.lg, marginBottom: spacing.sm },
  historyRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  historyDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
});

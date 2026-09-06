import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { CustomFieldDefinition, Lead, WorkflowStatus, WorkflowTransition } from '@decor/shared';
import { api } from '../api/client';
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
import { palette, spacing } from '../theme';
import { formatDateTime, formatInr, relativeTime } from '../lib/format';

type NextMove = WorkflowTransition & { toStatus: WorkflowStatus };

export function LeadDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const { leadId } = route.params as { leadId: string };
  const [moves, setMoves] = useState<NextMove[]>([]);
  const [moveSheet, setMoveSheet] = useState(false);
  const [pendingMove, setPendingMove] = useState<NextMove | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const fields = useApi<CustomFieldDefinition[]>(() => api.leadFields(), []);
  const lead = useApi<Lead>(
    useCallback(async () => {
      const fresh = await api.lead(leadId);
      setMoves(await api.allowedNext(fresh.status.id));
      return fresh;
    }, [leadId]),
    [leadId],
  );

  const move = async (target: NextMove, withNote?: string) => {
    setBusy(true);
    try {
      await api.changeLeadStatus(leadId, { toStatusId: target.toStatusId, note: withNote });
      haptic('notificationSuccess');
      setMoveSheet(false);
      setPendingMove(null);
      setNote('');
      lead.reload();
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
    <Screen refreshing={lead.refreshing} onRefresh={lead.refresh}>
      <ScreenHeader
        title={data.code}
        subtitle={relativeTime(data.createdAt)}
        onBack={() => navigation.goBack()}
      />

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

      {moves.length ? (
        <Button
          title="Move stage"
          variant="dark"
          onPress={() => setMoveSheet(true)}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      <Text variant="label" tone="muted" style={styles.blockLabel}>History</Text>
      {data.statusHistory?.map((entry) => (
        <View key={entry.id} style={styles.historyRow}>
          <View style={[styles.historyDot, { backgroundColor: entry.toStatus.color }]} />
          <View style={{ flex: 1 }}>
            <Text variant="small" bold>
              {entry.fromStatus ? `${entry.fromStatus.name} → ` : ''}{entry.toStatus.name}
            </Text>
            <Text variant="tiny" tone="faint">
              {formatDateTime(entry.changedAt)}
              {entry.changedBy ? ` · ${entry.changedBy.name}` : ''}
            </Text>
            {entry.note ? (
              <Text variant="tiny" tone="muted" style={{ marginTop: 2 }}>{entry.note}</Text>
            ) : null}
          </View>
        </View>
      ))}

      <Sheet
        visible={moveSheet}
        title="Move this lead"
        subtitle={`Currently ${data.status.name}`}
        onClose={() => {
          setMoveSheet(false);
          setPendingMove(null);
        }}>
        {pendingMove ? (
          <View>
            <Text variant="body" style={{ marginBottom: spacing.md }}>
              Moving to <Text bold tone="accent">{pendingMove.toStatus.name}</Text> needs a note.
            </Text>
            <Field label="Why?" value={note} onChangeText={setNote} autoFocus />
            <Button
              title="Confirm"
              loading={busy}
              disabled={!note.trim()}
              onPress={() => move(pendingMove, note.trim())}
            />
          </View>
        ) : (
          moves.map((m) => (
            <SheetOption
              key={m.id}
              label={m.label ?? m.toStatus.name}
              description={m.requiresNote ? 'Needs a note' : undefined}
              accent={m.toStatus.color}
              onPress={() => (m.requiresNote ? setPendingMove(m) : move(m))}
            />
          ))
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
  historyRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  historyDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
});

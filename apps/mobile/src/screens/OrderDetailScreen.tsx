import React, { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import type { Order, WorkflowStatus, WorkflowTransition } from '@decor/shared';
import { LENGTH_UNITS, UNIT_LABEL } from '@decor/shared';
import LinearGradient from 'react-native-linear-gradient';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useDisplayUnit } from '../hooks/useUnit';
import {
  Avatar,
  Button,
  Card,
  Chip,
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
import { gradients, palette, radius, shadow, spacing } from '../theme';
import { formatDateTime, relativeTime } from '../lib/format';

type NextMove = WorkflowTransition & { toStatus: WorkflowStatus };

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
  const [moves, setMoves] = useState<NextMove[]>([]);
  const [moveSheet, setMoveSheet] = useState(false);
  const [pendingMove, setPendingMove] = useState<NextMove | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const order = useApi<Order>(
    useCallback(async () => {
      const fresh = await api.order(orderId, unit);
      setMoves(await api.allowedNext(fresh.status.id));
      return fresh;
    }, [orderId, unit]),
    [orderId, unit],
  );

  const move = async (target: NextMove, withNote?: string) => {
    setBusy(true);
    try {
      await api.changeOrderStatus(orderId, { toStatusId: target.toStatusId, note: withNote });
      haptic('notificationSuccess');
      setMoveSheet(false);
      setPendingMove(null);
      setNote('');
      order.reload();
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

  return (
    <Screen refreshing={order.refreshing} onRefresh={order.refresh}>
      <ScreenHeader
        title={data.code}
        subtitle={relativeTime(data.createdAt)}
        onBack={() => navigation.goBack()}
      />

      {justPunched ? (
        <Animated.View entering={ZoomIn.duration(400).springify()} style={styles.punchedBanner}>
          <Icon name="check" size={16} color={palette.textOnAccent} />
          <Text variant="small" tone="onAccent" bold style={{ marginLeft: spacing.sm }}>
            Punched — it is on the board now
          </Text>
        </Animated.View>
      ) : null}

      {/* The order rendered as a physical card. */}
      <Animated.View entering={FadeInDown.duration(420).springify()} style={shadow.glow}>
        <LinearGradient
          colors={gradients.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.orderCard}>
          <View style={styles.orderCardTop}>
            <View style={{ flex: 1 }}>
              <Text variant="h1" tone="onAccent" numberOfLines={1}>{data.client.name}</Text>
              <Text variant="small" tone="onAccent" style={{ opacity: 0.72 }}>
                {data.location}
              </Text>
            </View>
            <Pill label={data.status.name} color={palette.textOnAccent} small />
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
        </LinearGradient>
      </Animated.View>

      <View style={styles.unitRow}>
        <Text variant="label" tone="faint">Show in</Text>
        {LENGTH_UNITS.map((u) => (
          <Chip key={u} label={UNIT_LABEL[u]} selected={unit === u} onPress={() => setUnit(u)} />
        ))}
      </View>

      {data.items.map((item, index) => (
        <Animated.View key={item.id} entering={FadeInDown.delay(index * 60).duration(320)}>
          <Card tone="dark" style={styles.itemCard}>
            <View style={styles.itemHead}>
              <Text variant="label" tone="faint">LINE {item.lineNo}</Text>
              <Text variant="small" tone="accent" bold>×{item.quantity}</Text>
            </View>
            <Text variant="h2">
              {item.display
                ? `${item.display.length} × ${item.display.width} ${UNIT_LABEL[item.display.unit]}`
                : '—'}
            </Text>
            <Text variant="tiny" tone="faint">
              {Number(item.lengthMm)} × {Number(item.widthMm)} mm stored
            </Text>
            <View style={styles.itemMeta}>
              <View
                style={[
                  styles.materialDot,
                  { backgroundColor: item.material.color ?? palette.textFaint },
                ]}
              />
              <Text variant="small" tone="muted">
                {item.material.name}
                {item.display?.thickness
                  ? ` · ${item.display.thickness} ${UNIT_LABEL[item.display.thicknessUnit]}`
                  : ''}
              </Text>
            </View>
            {item.notes ? (
              <Text variant="small" tone="muted" style={{ marginTop: spacing.sm }}>
                {item.notes}
              </Text>
            ) : null}
          </Card>
        </Animated.View>
      ))}

      {moves.length ? (
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
            {[...sizeImages, ...references].map((attachment) => (
              <Pressable key={attachment.id} style={styles.thumb}>
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
      {data.statusHistory?.map((entry) => (
        <View key={entry.id} style={styles.historyRow}>
          <View style={[styles.historyDot, { backgroundColor: entry.toStatus.color }]} />
          <View style={{ flex: 1 }}>
            <Text variant="small" bold>
              {entry.fromStatus ? `${entry.fromStatus.name} → ` : ''}
              {entry.toStatus.name}
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
        title="Move this order"
        subtitle={`Currently ${data.status.name}`}
        onClose={() => {
          setMoveSheet(false);
          setPendingMove(null);
          setNote('');
        }}>
        {pendingMove ? (
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
          moves.map((m) => (
            <SheetOption
              key={m.id}
              label={m.label ?? m.toStatus.name}
              description={
                m.requiresNote ? 'Needs a note' : `Move to ${m.toStatus.name}`
              }
              accent={m.toStatus.color}
              onPress={() => (m.requiresNote ? setPendingMove(m) : move(m))}
            />
          ))
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  punchedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: palette.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    marginBottom: spacing.lg,
  },
  orderCard: { borderRadius: radius.xl, padding: spacing.xl, minHeight: 170, justifyContent: 'space-between' },
  orderCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
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
  materialDot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.sm },
  blockLabel: { marginTop: spacing.xl, marginBottom: spacing.md },
  thumb: { width: 96, marginRight: spacing.md },
  thumbImage: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceLit,
  },
  historyRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  historyDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
});

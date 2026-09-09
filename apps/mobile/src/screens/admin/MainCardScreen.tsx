import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Layout,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { Workflow, WorkflowStatus } from '@fas/shared';
import { HOME_CARD_LIMIT } from '@fas/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import {
  Button,
  Card,
  Icon,
  Loader,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
  haptic,
} from '../../ui';
import { palette, radius, spacing } from '../../theme';

/** Row height, and therefore how far a drag has to travel to change places. */
const ROW = 58;

/**
 * What the home card counts.
 *
 * The card holds five stages and a shop watches different ones — a joinery
 * lives in Design and Production, a stone unit in Cutting and Polishing. So the
 * five are chosen here rather than derived from the flow, and their order on
 * this screen is their order on the card.
 */
export function MainCardScreen({ navigation }: { navigation: any }) {
  const workflow = useApi<Workflow>(() => api.defaultWorkflow(), []);

  const [chosen, setChosen] = useState<WorkflowStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!workflow.data) return;
    setChosen(
      workflow.data.statuses
        .filter((status) => status.homeCardOrder !== null && status.homeCardOrder !== undefined)
        .sort((a, b) => (a.homeCardOrder ?? 0) - (b.homeCardOrder ?? 0)),
    );
    setDirty(false);
  }, [workflow.data]);

  if (!workflow.data) return <Loader label="Loading the flow" />;

  const chosenIds = new Set(chosen.map((status) => status.id));
  const rest = workflow.data.statuses.filter((status) => !chosenIds.has(status.id));
  const full = chosen.length >= HOME_CARD_LIMIT;

  /** Move the stage at `from` by `steps` places, keeping it inside the list. */
  const move = (from: number, steps: number) => {
    setChosen((current) => {
      const to = Math.min(Math.max(from + steps, 0), current.length - 1);
      if (to === from) return current;
      const next = current.slice();
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return next;
    });
    haptic('impactLight');
    setDirty(true);
  };

  const add = (status: WorkflowStatus) => {
    if (full) return;
    haptic('impactLight');
    setChosen((current) => [...current, status]);
    setDirty(true);
  };

  const remove = (id: string) => {
    haptic('impactLight');
    setChosen((current) => current.filter((status) => status.id !== id));
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.setHomeCardStatuses(
        workflow.data!.id,
        chosen.map((status) => status.id),
      );
      haptic('notificationSuccess');
      setDirty(false);
      navigation.goBack();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="Main card"
        subtitle="What the home screen counts"
        onBack={() => navigation.goBack()}
      />

      <Text variant="tiny" tone="faint" style={styles.hint}>
        Up to {HOME_CARD_LIMIT} stages, counted live on the home card. Drag a stage
        to move it up or down — the order here is the order there.
      </Text>

      <SectionHeader title={`On the card · ${chosen.length}/${HOME_CARD_LIMIT}`} />
      {chosen.length === 0 ? (
        <Card tone="dark">
          <Text variant="small" tone="muted">
            Nothing on the card yet. Add a stage from below.
          </Text>
        </Card>
      ) : (
        <View style={{ height: chosen.length * ROW }}>
          {chosen.map((status, index) => (
            <ChosenRow
              key={status.id}
              status={status}
              index={index}
              onMove={move}
              onRemove={() => remove(status.id)}
            />
          ))}
        </View>
      )}

      <SectionHeader title="Not on the card" />
      {rest.length === 0 ? (
        <Text variant="tiny" tone="faint">Every stage in the flow is on the card.</Text>
      ) : (
        rest.map((status) => (
          <Animated.View key={status.id} layout={Layout.springify()}>
            <Card
              tone="dark"
              style={styles.row}
              onPress={full ? undefined : () => add(status)}>
              <View style={[styles.dot, { backgroundColor: status.color }]} />
              <View style={{ flex: 1 }}>
                <Text variant="body" bold={!full} tone={full ? 'faint' : 'default'}>
                  {status.name}
                </Text>
                <Text variant="tiny" tone="faint">
                  {status._count?.ordersAtStatus ?? 0} here now
                </Text>
              </View>
              <Icon
                name="plus"
                size={18}
                color={full ? palette.textFaint : palette.accent}
              />
            </Card>
          </Animated.View>
        ))
      )}

      {full ? (
        <Text variant="tiny" tone="faint" style={styles.hint}>
          The card is full. Take one off to make room.
        </Text>
      ) : null}

      <Button
        title="Save the card"
        size="lg"
        loading={busy}
        disabled={!dirty}
        onPress={save}
        style={{ marginTop: spacing.xl }}
      />
    </Screen>
  );
}

/**
 * One stage on the card.
 *
 * The row follows the finger and the list reorders when it is let go, rather
 * than shuffling under it mid-drag: a list that rearranges itself while you are
 * still holding a row is what makes these things feel like they are fighting
 * you.
 */
function ChosenRow({
  status,
  index,
  onMove,
  onRemove,
}: {
  status: WorkflowStatus;
  index: number;
  onMove: (from: number, steps: number) => void;
  onRemove: () => void;
}) {
  const offset = useSharedValue(0);
  const lifted = useSharedValue(0);

  const drag = Gesture.Pan()
    .withTestId(`main-card-drag-${status.id}`)
    .activateAfterLongPress(120)
    .onStart(() => {
      lifted.value = withTiming(1, { duration: 120 });
    })
    .onUpdate((event) => {
      offset.value = event.translationY;
    })
    .onEnd(() => {
      const steps = Math.round(offset.value / ROW);
      offset.value = 0;
      lifted.value = withTiming(0, { duration: 160 });
      if (steps !== 0) runOnJS(onMove)(index, steps);
    });

  const style = useAnimatedStyle(() => ({
    top: index * ROW,
    transform: [
      { translateY: offset.value },
      { scale: 1 + lifted.value * 0.03 },
    ],
    zIndex: lifted.value > 0 ? 10 : 1,
    shadowOpacity: lifted.value * 0.45,
  }));

  return (
    <Animated.View style={[styles.chosenWrap, style]}>
      <GestureDetector gesture={drag}>
        <View style={styles.chosen}>
          <Icon name="more" size={18} color={palette.textFaint} />
          <View style={[styles.dot, { backgroundColor: status.color }]} />
          <View style={{ flex: 1 }}>
            <Text variant="body" bold numberOfLines={1}>{status.name}</Text>
            <Text variant="tiny" tone="faint">
              {status._count?.ordersAtStatus ?? 0} here now
            </Text>
          </View>
          <Text variant="tiny" tone="accent" bold style={styles.position}>
            {index + 1}
          </Text>
          <Pressable
            testID={`main-card-remove-${status.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Take ${status.name} off the card`}
            onPress={onRemove}
            hitSlop={10}>
            <Icon name="close" size={16} color={palette.textMuted} />
          </Pressable>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hint: { marginBottom: spacing.md, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  chosenWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ROW,
    paddingBottom: spacing.sm,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
  },
  chosen: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceLit,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  position: { marginRight: spacing.xs },
});

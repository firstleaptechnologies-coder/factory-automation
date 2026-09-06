import React, { useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { WorkflowStatus } from '@decor/shared';
import { motion, palette, radius, spacing } from '../theme';
import { Text, Icon, Pill, EmptyState, haptic } from '../ui';

const COLUMN_WIDTH = Math.min(Dimensions.get('window').width * 0.78, 320);
/** How far a card must travel before the drag counts as a stage change. */
const COMMIT_DISTANCE = 90;

/** The board only needs to identify a card; the column supplies the stage. */
export interface BoardItem {
  id: string;
}

/**
 * The board, as columns you scroll through with cards you drag between stages.
 *
 * A phone has no room for the desktop's side-by-side kanban, so the columns are
 * paged and a card is moved by dragging it left or right one stage at a time.
 * That maps onto how the flow is actually shaped — mostly a line — and it means
 * the gesture never has to hit-test a column that is off screen.
 *
 * The move still goes to the server, which checks it against the graph; a
 * refusal springs the card back where it was.
 */
export function StageBoard<T extends BoardItem>({
  columns,
  renderCard,
  onMove,
  emptyLabel = 'Nothing here',
}: {
  columns: { status: WorkflowStatus; items: T[]; subtitle?: string }[];
  renderCard: (item: T) => React.ReactNode;
  onMove: (item: T, toStatusId: string) => Promise<void>;
  emptyLabel?: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={COLUMN_WIDTH + spacing.md}
      decelerationRate="fast"
      contentContainerStyle={styles.scroll}>
      {columns.map((column, columnIndex) => (
        <View key={column.status.id} style={styles.column}>
          <View style={[styles.columnHead, { borderTopColor: column.status.color }]}>
            <View style={{ flex: 1 }}>
              <Text variant="h3" numberOfLines={1}>{column.status.name}</Text>
              {column.subtitle ? (
                <Text variant="tiny" tone="accent" bold>{column.subtitle}</Text>
              ) : null}
            </View>
            <View style={styles.count}>
              <Text variant="tiny" tone="muted" bold>{column.items.length}</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.columnBody}>
            {column.items.length === 0 ? (
              <EmptyState title={emptyLabel} />
            ) : (
              column.items.map((item) => (
                <DraggableCard
                  key={item.id}
                  item={item}
                  previousStatus={columns[columnIndex - 1]?.status}
                  nextStatus={columns[columnIndex + 1]?.status}
                  onMove={onMove}>
                  {renderCard(item)}
                </DraggableCard>
              ))
            )}
          </ScrollView>
        </View>
      ))}
    </ScrollView>
  );
}

function DraggableCard<T extends BoardItem>({
  item,
  previousStatus,
  nextStatus,
  onMove,
  children,
}: {
  item: T;
  previousStatus?: WorkflowStatus;
  nextStatus?: WorkflowStatus;
  onMove: (item: T, toStatusId: string) => Promise<void>;
  children: React.ReactNode;
}) {
  const offset = useSharedValue(0);
  const lifted = useSharedValue(0);
  const [pending, setPending] = useState(false);

  const commit = async (statusId: string) => {
    // `pending` lives on the JS thread and the gesture runs on the UI thread,
    // so the flag can lag by a frame. Checking it here closes that window.
    if (pending) return;
    setPending(true);
    try {
      await onMove(item, statusId);
    } finally {
      setPending(false);
      offset.value = withSpring(0, motion.spring);
    }
  };

  const cancel = () => {
    offset.value = withSpring(0, motion.spring);
  };

  const pan = Gesture.Pan()
    // A card that is already moving must not accept another drag. Without this
    // a single swipe can commit several stages in a row: the move is async, the
    // board re-renders underneath it, and the gesture stays live the whole time
    // — so the card walks along the flow instead of advancing one stage.
    .enabled(!pending)
    .activeOffsetX([-14, 14])
    // Vertical movement belongs to the column's scroll view, so the horizontal
    // threshold above has to be crossed before this gesture takes over.
    .failOffsetY([-12, 12])
    .onStart(() => {
      lifted.value = withSpring(1, motion.spring);
      runOnJS(haptic)('impactLight');
    })
    .onUpdate((event) => {
      offset.value = event.translationX;
    })
    .onEnd(() => {
      lifted.value = withSpring(0, motion.spring);
      const distance = offset.value;

      if (distance <= -COMMIT_DISTANCE && previousStatus) {
        runOnJS(commit)(previousStatus.id);
      } else if (distance >= COMMIT_DISTANCE && nextStatus) {
        runOnJS(commit)(nextStatus.id);
      } else {
        runOnJS(cancel)();
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offset.value },
      { scale: 1 + lifted.value * 0.03 },
      { rotateZ: `${interpolate(offset.value, [-160, 0, 160], [-3, 0, 3])}deg` },
    ],
    zIndex: lifted.value > 0 ? 10 : 1,
  }));

  const leftHint = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, [-COMMIT_DISTANCE, -20, 0], [1, 0.2, 0], 'clamp'),
  }));
  const rightHint = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, [0, 20, COMMIT_DISTANCE], [0, 0.2, 1], 'clamp'),
  }));

  return (
    <View style={styles.cardSlot}>
      {previousStatus ? (
        <Animated.View style={[styles.hint, styles.hintLeft, leftHint]}>
          <Icon name="chevronLeft" size={14} color={palette.textOnAccent} />
          <Text variant="micro" tone="onAccent" bold numberOfLines={1}>
            {previousStatus.name}
          </Text>
        </Animated.View>
      ) : null}
      {nextStatus ? (
        <Animated.View style={[styles.hint, styles.hintRight, rightHint]}>
          <Text variant="micro" tone="onAccent" bold numberOfLines={1}>
            {nextStatus.name}
          </Text>
          <Icon name="chevronRight" size={14} color={palette.textOnAccent} />
        </Animated.View>
      ) : null}

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, cardStyle, pending && { opacity: 0.6 }]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  // Padding on both sides: the screen itself is unpadded so the columns can
  // run to the edge when scrolled, but the first one must not sit flush.
  scroll: { paddingHorizontal: spacing.lg, gap: spacing.md },
  column: { width: COLUMN_WIDTH },
  columnHead: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 3,
    borderTopColor: 'rgba(0,0,0,0.28)',
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.28)',
  },
  count: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.surfaceLit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  columnBody: { paddingTop: spacing.md, paddingBottom: 140 },
  cardSlot: { marginBottom: spacing.md, justifyContent: 'center' },
  card: {
    backgroundColor: palette.surfaceLit,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.28)',
    padding: spacing.md,
  },
  hint: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: palette.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    maxWidth: 120,
  },
  hintLeft: { left: 0 },
  hintRight: { right: 0 },
});

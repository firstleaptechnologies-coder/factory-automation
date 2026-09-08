import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { Workflow, WorkflowStatus, WorkflowTransition } from '@decor/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import {
  Button,
  Chip,
  Icon,
  Loader,
  RoundButton,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
  haptic,
} from '../../ui';
import { palette, radius, spacing } from '../../theme';

const NODE_W = 156;
const NODE_H = 78;
/** The drawing surface is bigger than the screen; you pan around it. */
const CANVAS_W = 2400;
const CANVAS_H = 2400;

type Point = { x: number; y: number };

/**
 * How far in and out the board may be zoomed.
 *
 * The floor is low because a phone is narrow: a six-stage flow is well over a
 * thousand points wide, and a floor that kept the labels comfortable meant
 * "fit" could never actually show the whole thing.
 */
const clampScale = (value: number) => Math.min(1.6, Math.max(0.3, value));
type Positions = Record<string, Point>;

/**
 * The flow builder, as a canvas.
 *
 * Same graph the web builder edits and the same API behind it — stages are
 * dragged where you want them, and an arrow between two stages is the rule the
 * API enforces when an order moves. Connecting is a drag out of a stage's right
 * edge onto another stage, which works with a thumb; dragging a thin wire to a
 * 4pt port does not.
 */
export function FlowCanvasScreen({ route, navigation }: { route: any; navigation: any }) {
  const { workflowId } = (route.params ?? {}) as { workflowId?: string };

  const workflows = useApi<Workflow[]>(() => api.workflows(), []);
  const [selectedId, setSelectedId] = useState<string | null>(workflowId ?? null);
  const activeId =
    selectedId ?? workflows.data?.find((w) => w.isDefault)?.id ?? workflows.data?.[0]?.id;

  const workflow = useApi<Workflow | null>(
    useCallback(async () => (activeId ? api.workflow(activeId) : null), [activeId]),
    [activeId],
  );

  // Positions live in one shared value so a drag can move a node and redraw
  // every wire attached to it on the UI thread, without a React render.
  const positions = useSharedValue<Positions>({});
  const [layout, setLayout] = useState<Positions>({});
  const [transitions, setTransitions] = useState<WorkflowTransition[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // The wire being dragged out of a node, before it lands anywhere. In state
  // for the same reason the edges are.
  const [linking, setLinking] = useState<{ from: string; to: Point } | null>(null);

  const [editing, setEditing] = useState<WorkflowStatus | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const startScale = useSharedValue(1);

  const data = workflow.data;

  useEffect(() => {
    if (!data) return;
    /*
     * A flow that has never been arranged is laid out as a readable staircase
     * rather than a pile at the origin. That is decided once, for the whole
     * graph — asking it of each stage separately would treat one deliberately
     * dragged to 0,0 as unplaced and throw it back into the staircase.
     */
    const arranged = data.statuses.some((status) => status.canvasX || status.canvasY);
    const next: Positions = {};
    data.statuses.forEach((status, index) => {
      next[status.id] = arranged
        ? { x: status.canvasX, y: status.canvasY }
        : { x: 80 + (index % 2) * 190, y: 80 + index * 120 };
    });
    positions.value = next;
    setLayout(next);
    setTransitions(data.transitions);
    setDirty(false);
  }, [data, positions]);

  const statusById = useCallback(
    (id: string) => data?.statuses.find((status) => status.id === id),
    [data],
  );

  /** Which node contains a canvas point — used to land a dragged wire. */
  const nodeAt = useCallback(
    (point: Point, exclude?: string | null) => {
      const entries = Object.entries(positions.value);
      for (const [id, position] of entries) {
        if (id === exclude) continue;
        if (
          point.x >= position.x &&
          point.x <= position.x + NODE_W &&
          point.y >= position.y &&
          point.y <= position.y + NODE_H
        ) {
          return id;
        }
      }
      return null;
    },
    [positions],
  );

  const connect = useCallback(
    (fromStatusId: string, toStatusId: string) => {
      setTransitions((current) => {
        const exists = current.some(
          (t) => t.fromStatusId === fromStatusId && t.toStatusId === toStatusId,
        );
        if (exists) return current;
        haptic('notificationSuccess');
        setDirty(true);
        return [
          ...current,
          {
            id: `new-${fromStatusId}-${toStatusId}`,
            workflowId: activeId ?? '',
            fromStatusId,
            toStatusId,
            label: null,
            requiresNote: false,
            allowedRoles: [],
          },
        ];
      });
    },
    [activeId],
  );

  const finishLink = useCallback(
    (fromStatusId: string, point: Point) => {
      const target = nodeAt(point, fromStatusId);
      if (target) connect(fromStatusId, target);
      else haptic('notificationError');
      setLinking(null);
    },
    [connect, nodeAt],
  );

  const commitMove = useCallback((id: string, point: Point, landed: boolean) => {
    setLayout((current) => ({ ...current, [id]: point }));
    // Only a finished drag counts as an edit; a wire keeping up with a finger
    // does not put the board in an unsaved state on its own.
    if (landed) setDirty(true);
  }, []);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      await api.saveWorkflowGraph(data.id, {
        positions: Object.entries(layout).map(([id, point]) => ({
          id,
          canvasX: Math.round(point.x),
          canvasY: Math.round(point.y),
        })),
        transitions: transitions.map((t) => ({
          fromStatusId: t.fromStatusId,
          toStatusId: t.toStatusId,
          label: t.label ?? null,
          requiresNote: t.requiresNote,
          allowedRoles: t.allowedRoles,
        })),
      });
      haptic('notificationSuccess');
      setDirty(false);
      workflow.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const removeTransition = (transition: WorkflowTransition) => {
    const from = statusById(transition.fromStatusId)?.name ?? '?';
    const to = statusById(transition.toStatusId)?.name ?? '?';
    Alert.alert('Remove this move?', `Orders will no longer go from ${from} to ${to}.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setTransitions((current) => current.filter((t) => t.id !== transition.id));
          setDirty(true);
        },
      },
    ]);
  };

  /*
   * Panning and pinching the board itself.
   *
   * One finger, not two: a stage carries its own drag, so a finger that lands
   * on empty board can only mean "move the board" — and demanding two fingers
   * for it meant most people never found out the canvas moved at all.
   */
  const pan = Gesture.Pan()
    .withTestId('flow-board-pan')
    .onStart(() => {
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate((event) => {
      tx.value = startTx.value + event.translationX;
      ty.value = startTy.value + event.translationY;
    });

  /*
   * Where the board has to sit for whatever is in the middle of the screen to
   * stay in the middle as the scale changes.
   *
   * The board is scaled about its own centre, two thousand points away, so
   * zooming without this correction throws the stages you were looking at off
   * the side of the screen.
   */
  const anchored = (
    offset: number,
    viewSpan: number,
    canvasSpan: number,
    from: number,
    to: number,
  ) => {
    'worklet';
    const middle = viewSpan / 2;
    const held = (middle - offset - (canvasSpan / 2) * (1 - from)) / from;
    return middle - held * to - (canvasSpan / 2) * (1 - to);
  };

  const pinch = Gesture.Pinch()
    .withTestId('flow-board-pinch')
    .onStart(() => {
      startScale.value = scale.value;
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate((event) => {
      const to = clampScale(startScale.value * event.scale);
      scale.value = to;
      tx.value = anchored(startTx.value, viewport.width, CANVAS_W, startScale.value, to);
      ty.value = anchored(startTy.value, viewport.height, CANVAS_H, startScale.value, to);
    });

  const board = Gesture.Simultaneous(pan, pinch);

  /** Step the zoom from the buttons, about the middle of the viewport. */
  const zoomBy = (factor: number) => {
    const from = scale.value;
    const to = clampScale(from * factor);
    if (to === from) return;
    tx.value = withTiming(anchored(tx.value, viewport.width, CANVAS_W, from, to), {
      duration: 160,
    });
    ty.value = withTiming(anchored(ty.value, viewport.height, CANVAS_H, from, to), {
      duration: 160,
    });
    scale.value = withTiming(to, { duration: 160 });
  };

  /** Put the whole flow back in view, whatever was dragged where. */
  const fit = () => {
    const points = Object.values(positions.value);
    if (!points.length) {
      tx.value = withTiming(0, { duration: 200 });
      ty.value = withTiming(0, { duration: 200 });
      scale.value = withTiming(1, { duration: 200 });
      return;
    }
    const left = Math.min(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y));
    const right = Math.max(...points.map((point) => point.x + NODE_W));
    const bottom = Math.max(...points.map((point) => point.y + NODE_H));

    const next = clampScale(
      Math.min(viewport.width / (right - left + 80), viewport.height / (bottom - top + 80)),
    );
    scale.value = withTiming(next, { duration: 220 });
    // The board is scaled about its centre, so the offset is measured from
    // there rather than from its top-left corner.
    tx.value = withTiming(
      viewport.width / 2 - ((left + right) / 2) * next - (CANVAS_W / 2) * (1 - next),
      { duration: 220 },
    );
    ty.value = withTiming(
      viewport.height / 2 - ((top + bottom) / 2) * next - (CANVAS_H / 2) * (1 - next),
      { duration: 220 },
    );
  };

  const boardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  if (!data) return <Loader label="Loading the flow" />;

  return (
    <Screen scroll={false}>
      <ScreenHeader
        title="Flow builder"
        subtitle={data.name}
        onBack={() => navigation.goBack()}
      />

      {(workflows.data?.length ?? 0) > 1 ? (
        <View style={styles.pickRow}>
          {workflows.data?.map((w) => (
            <Chip
              key={w.id}
              label={w.kind === 'LEAD' ? 'Leads' : 'Orders'}
              selected={w.id === activeId}
              onPress={() => setSelectedId(w.id)}
            />
          ))}
        </View>
      ) : null}

      <Text variant="tiny" tone="faint" style={styles.hint}>
        Drag a stage to move it. Drag out of its right edge onto another stage to
        allow that move. Drag the board itself to move around it, pinch to zoom.
      </Text>

      <GestureDetector gesture={board}>
        <View
          testID="canvas-viewport"
          style={styles.viewport}
          onLayout={(event) =>
            setViewport({
              width: event.nativeEvent.layout.width,
              height: event.nativeEvent.layout.height,
            })
          }>
          <Animated.View testID="canvas-board" style={[styles.board, boardStyle]}>
            {transitions.map((transition) => (
              <Wire
                key={transition.id}
                from={layout[transition.fromStatusId]}
                to={layout[transition.toStatusId]}
                color={statusById(transition.toStatusId)?.color ?? palette.textMuted}
                testID={`edge-${transition.fromStatusId}-${transition.toStatusId}`}
              />
            ))}

            {linking ? (
              <Wire
                testID="link-wire"
                from={layout[linking.from]}
                to={{ x: linking.to.x - NODE_W, y: linking.to.y - NODE_H / 2 }}
                color={palette.accent}
                dashed
              />
            ) : null}

            {data.statuses.map((status) => (
              <Node
                key={status.id}
                status={status}
                positions={positions}
                scale={scale}
                onMoved={commitMove}
                onOpen={() => setEditing(status)}
                onLinkMove={(point) => setLinking({ from: status.id, to: point })}
                onLinkEnd={(point) => finishLink(status.id, point)}
              />
            ))}
          </Animated.View>

          {/* The same three the web canvas offers, where a thumb can reach. */}
          <View style={styles.controls} pointerEvents="box-none">
            <RoundButton icon="plus" testID="zoom-in" accessibilityLabel="Zoom in" onPress={() => zoomBy(1.25)} />
            <RoundButton icon="minus" testID="zoom-out" accessibilityLabel="Zoom out" onPress={() => zoomBy(0.8)} />
            <RoundButton icon="scan" testID="fit-view" accessibilityLabel="Fit the flow" onPress={fit} />
          </View>
        </View>
      </GestureDetector>

      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <Text variant="tiny" tone="muted">
            {data.statuses.length} stages · {transitions.length} moves
          </Text>
          {dirty ? (
            <Text variant="tiny" tone="warning" bold>Unsaved changes</Text>
          ) : (
            <Text variant="tiny" tone="faint">Everything saved</Text>
          )}
        </View>
        <Button
          title="Save flow"
          size="sm"
          disabled={!dirty}
          loading={saving}
          onPress={save}
          style={{ width: 130 }}
        />
      </View>

      <Sheet
        visible={Boolean(editing)}
        title={editing?.name}
        subtitle={editing ? `${editing.code} · moves out of this stage` : undefined}
        onClose={() => setEditing(null)}>
        {editing
          ? (() => {
              const outgoing = transitions.filter((t) => t.fromStatusId === editing.id);
              return outgoing.length === 0 ? (
                <Text variant="small" tone="muted">
                  Nothing leaves this stage yet. Drag from its right edge onto another
                  stage to allow a move.
                </Text>
              ) : (
                <View style={styles.chipWrap}>
                  {outgoing.map((transition) => (
                    <Chip
                      key={transition.id}
                      label={`→ ${statusById(transition.toStatusId)?.name ?? '?'}`}
                      accent={statusById(transition.toStatusId)?.color}
                      selected
                      onPress={() => {
                        setEditing(null);
                        removeTransition(transition);
                      }}
                    />
                  ))}
                </View>
              );
            })()
          : null}
        <Button
          title="Edit this stage"
          variant="dark"
          onPress={() => {
            const target = editing;
            setEditing(null);
            navigation.navigate('AdminFlow', { focusStatusId: target?.id });
          }}
          style={{ marginTop: spacing.lg }}
        />
      </Sheet>
    </Screen>
  );
}

/**
 * One wire between two stages.
 *
 * Views rather than SVG: react-native-svg on this version paints a path once
 * and never again, so wires stayed pinned to where their stage used to be
 * while the stage itself moved away. A rotated view is the same machinery the
 * stages themselves use, and it follows.
 */
function Wire({
  from,
  to,
  color,
  dashed,
  testID,
}: {
  /** Top-left of the stage the wire leaves. */
  from: Point | undefined;
  /** Top-left of the stage it arrives at — or the finger, mid-drag. */
  to: Point | undefined;
  color: string;
  dashed?: boolean;
  testID?: string;
}) {
  if (!from || !to) return null;

  const a = { x: from.x + NODE_W, y: from.y + NODE_H / 2 };
  const b = { x: to.x, y: to.y + NODE_H / 2 };
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const angle = `${Math.atan2(b.y - a.y, b.x - a.x)}rad`;

  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={[
        styles.wire,
        { left: a.x, top: a.y, width: length, transform: [{ rotate: angle }] },
      ]}>
      <View
        style={[
          styles.wireLine,
          { backgroundColor: color },
          dashed && styles.wireDashed,
        ]}
      />
      <View style={[styles.wireHead, { borderLeftColor: color }]} />
    </View>
  );
}

function Node({
  status,
  positions,
  scale,
  onMoved,
  onOpen,
  onLinkMove,
  onLinkEnd,
}: {
  status: WorkflowStatus;
  positions: SharedValue<Positions>;
  scale: SharedValue<number>;
  /** `landed` is false on the frames of a drag, true when it is let go. */
  onMoved: (id: string, point: Point, landed: boolean) => void;
  onOpen: () => void;
  onLinkMove: (point: Point) => void;
  onLinkEnd: (point: Point) => void;
}) {
  const start = useSharedValue<Point>({ x: 0, y: 0 });
  const lifted = useSharedValue(0);

  const move = (next: Point) => {
    'worklet';
    positions.value = { ...positions.value, [status.id]: next };
  };

  const drag = Gesture.Pan()
    .withTestId(`flow-drag-${status.id}`)
    .maxPointers(1)
    .onStart(() => {
      start.value = positions.value[status.id] ?? { x: 0, y: 0 };
      lifted.value = withTiming(1, { duration: 120 });
    })
    .onUpdate((event) => {
      // Divide by the board's zoom, or the node runs away from the finger.
      const next = {
        x: start.value.x + event.translationX / scale.value,
        y: start.value.y + event.translationY / scale.value,
      };
      move(next);
      // Reported every frame so the wires attached to this stage keep up.
      runOnJS(onMoved)(status.id, next, false);
    })
    .onEnd(() => {
      lifted.value = withTiming(0, { duration: 160 });
      runOnJS(onMoved)(status.id, positions.value[status.id], true);
    });

  const tap = Gesture.Tap().withTestId(`flow-tap-${status.id}`).onEnd(() => {
    runOnJS(onOpen)();
  });

  // The link handle: a pull out of the right edge, dropped on another stage.
  const link = Gesture.Pan()
    .withTestId(`flow-link-${status.id}`)
    .maxPointers(1)
    .onStart(() => {
      const position = positions.value[status.id];
      runOnJS(onLinkMove)({ x: position.x + NODE_W, y: position.y + NODE_H / 2 });
    })
    .onUpdate((event) => {
      const position = positions.value[status.id];
      runOnJS(onLinkMove)({
        x: position.x + NODE_W + event.translationX / scale.value,
        y: position.y + NODE_H / 2 + event.translationY / scale.value,
      });
    })
    .onEnd((event) => {
      const position = positions.value[status.id];
      runOnJS(onLinkEnd)({
        x: position.x + NODE_W + event.translationX / scale.value,
        y: position.y + NODE_H / 2 + event.translationY / scale.value,
      });
    });

  const style = useAnimatedStyle(() => {
    const position = positions.value[status.id] ?? { x: 0, y: 0 };
    return {
      transform: [
        { translateX: position.x },
        { translateY: position.y },
        { scale: 1 + lifted.value * 0.04 },
      ],
      shadowOpacity: 0.4 + lifted.value * 0.35,
      zIndex: lifted.value > 0 ? 10 : 1,
    };
  });

  return (
    <Animated.View style={[styles.node, style]}>
      <GestureDetector gesture={Gesture.Exclusive(drag, tap)}>
        <View style={styles.nodeBody}>
          <View style={[styles.nodeBar, { backgroundColor: status.color }]} />
          <Text variant="small" bold numberOfLines={2}>{status.name}</Text>
          <Text variant="tiny" tone="faint" numberOfLines={1}>
            {status.isInitial ? 'start · ' : status.isTerminal ? 'end · ' : ''}
            {status.code}
          </Text>
        </View>
      </GestureDetector>

      <GestureDetector gesture={link}>
        <View style={[styles.port, { backgroundColor: palette.accent }]} hitSlop={12}>
          <Icon name="plus" size={12} color={palette.white} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pickRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  hint: { marginBottom: spacing.md, lineHeight: 17 },
  viewport: {
    flex: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: palette.surfaceInset,
  },
  board: { width: CANVAS_W, height: CANVAS_H },
  controls: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    gap: spacing.sm,
  },
  /* Anchored at the source stage and rotated towards the target. */
  wire: {
    position: 'absolute',
    height: 12,
    justifyContent: 'center',
    transformOrigin: 'left center',
  },
  wireLine: { height: 2, borderRadius: 1, opacity: 0.75 },
  wireDashed: { opacity: 0.9 },
  wireHead: {
    position: 'absolute',
    right: 0,
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 9,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  node: {
    position: 'absolute',
    width: NODE_W,
    height: NODE_H,
    top: 0,
    left: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 4, height: 6 },
    shadowRadius: 10,
  },
  nodeBody: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceLit,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    gap: 2,
    overflow: 'hidden',
  },
  nodeBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  port: {
    position: 'absolute',
    right: -11,
    top: NODE_H / 2 - 11,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

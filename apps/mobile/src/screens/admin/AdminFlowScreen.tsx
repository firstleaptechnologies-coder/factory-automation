import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import type { Workflow, WorkflowStatus } from '@decor/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import {
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
} from '../../ui';
import { palette, radius, spacing } from '../../theme';

const CATEGORIES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
const COLORS = ['#6B7785', '#2F81F7', '#D6F55B', '#D29922', '#8957E5', '#2EA043', '#DA3633'];

/**
 * The flow editor, made for a phone.
 *
 * The web builder is a canvas you drag nodes around on; that does not survive
 * being shrunk to a phone. Here the same graph is edited as a list of stages,
 * each showing the moves out of it — the structure is identical, the API is
 * identical, only the way you touch it differs.
 */
export function AdminFlowScreen({ navigation }: { navigation: any }) {
  const workflows = useApi<Workflow[]>(() => api.workflows(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const activeId = selectedId ?? workflows.data?.find((w) => w.isDefault)?.id ?? workflows.data?.[0]?.id;
  const workflow = useApi<Workflow | null>(
    useCallback(async () => (activeId ? api.workflow(activeId) : null), [activeId]),
    [activeId],
  );

  const [statusSheet, setStatusSheet] = useState(false);
  const [editing, setEditing] = useState<WorkflowStatus | null>(null);
  const [form, setForm] = useState({ code: '', name: '', color: COLORS[0], category: 'OPEN' as string });

  const [transitionFrom, setTransitionFrom] = useState<WorkflowStatus | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      haptic('notificationSuccess');
      workflow.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!workflow.data) return <Loader label="Loading the flow" />;
  const data = workflow.data;

  const outgoing = (statusId: string) =>
    data.transitions.filter((t) => t.fromStatusId === statusId);
  const statusById = (id: string) => data.statuses.find((s) => s.id === id);

  return (
    <Screen refreshing={workflow.refreshing} onRefresh={workflow.refresh}>
      <ScreenHeader
        title="Status flow"
        subtitle={data.name}
        onBack={() => navigation.goBack()}
      />

      {(workflows.data?.length ?? 0) > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.wfRow}>
          {workflows.data?.map((w) => (
            <View key={w.id} style={{ marginRight: spacing.sm }}>
              <Chip
                label={`${w.name} · ${w.kind === 'LEAD' ? 'leads' : 'orders'}`}
                selected={w.id === activeId}
                onPress={() => setSelectedId(w.id)}
              />
            </View>
          ))}
        </ScrollView>
      ) : null}

      <Text variant="tiny" tone="faint" style={styles.hint}>
        This graph is the rule the API enforces. A move with no arrow is refused.
      </Text>

      <Button
        title="Add stage"
        icon={<Icon name="plus" size={17} color={palette.textOnAccent} />}
        onPress={() => {
          setEditing(null);
          setForm({ code: '', name: '', color: COLORS[0], category: 'OPEN' });
          setStatusSheet(true);
        }}
        style={{ marginBottom: spacing.lg }}
      />

      {data.statuses
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((status, index) => (
          <Animated.View
            key={status.id}
            entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}
            layout={Layout.springify()}>
            <Card tone="dark" style={styles.stage}>
              <View style={styles.stageHead}>
                <View style={[styles.stageBar, { backgroundColor: status.color }]} />
                <View style={{ flex: 1 }}>
                  <View style={styles.stageTitleRow}>
                    <Text variant="h3">{status.name}</Text>
                    {status.isInitial ? <Pill label="START" color={palette.accent} small /> : null}
                    {status.isTerminal ? <Pill label="END" color={palette.surfaceLit} small /> : null}
                  </View>
                  <Text variant="tiny" tone="muted">
                    {status.code} · {status.category.replace('_', ' ').toLowerCase()}
                    {status.parentId ? ` · under ${statusById(status.parentId)?.name}` : ''}
                    {status._count?.ordersAtStatus ? ` · ${status._count.ordersAtStatus} here` : ''}
                  </Text>
                </View>
                <Button
                  title="Edit"
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    setEditing(status);
                    setForm({
                      code: status.code,
                      name: status.name,
                      color: status.color,
                      category: status.category,
                    });
                    setStatusSheet(true);
                  }}
                />
              </View>

              <Text variant="label" tone="faint" style={styles.movesLabel}>
                Moves out — tap to remove
              </Text>
              <View style={styles.chipWrap}>
                {outgoing(status.id).length === 0 ? (
                  <Text variant="tiny" tone="faint">Nothing leaves this stage</Text>
                ) : (
                  outgoing(status.id).map((transition) => {
                    const target = statusById(transition.toStatusId);
                    return (
                      <Chip
                        key={transition.id}
                        label={`→ ${target?.name ?? '?'}${transition.requiresNote ? ' *' : ''}`}
                        accent={target?.color}
                        selected
                        onPress={() =>
                          Alert.alert(
                            'Remove this move?',
                            `Orders will no longer be able to go from ${status.name} to ${target?.name}.`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Remove',
                                style: 'destructive',
                                onPress: () =>
                                  run(() =>
                                    api.saveWorkflowGraph(data.id, {
                                      positions: data.statuses.map((s) => ({
                                        id: s.id,
                                        canvasX: s.canvasX,
                                        canvasY: s.canvasY,
                                      })),
                                      transitions: data.transitions
                                        .filter((t) => t.id !== transition.id)
                                        .map((t) => ({
                                          fromStatusId: t.fromStatusId,
                                          toStatusId: t.toStatusId,
                                          label: t.label,
                                          requiresNote: t.requiresNote,
                                          allowedRoles: t.allowedRoles,
                                        })),
                                    }),
                                  ),
                              },
                            ],
                          )
                        }
                      />
                    );
                  })
                )}
                <Chip label="+ Move" onPress={() => setTransitionFrom(status)} />
              </View>
            </Card>
          </Animated.View>
        ))}

      <Sheet
        visible={statusSheet}
        title={editing ? `Edit ${editing.name}` : 'Add stage'}
        onClose={() => setStatusSheet(false)}>
        <Field
          label="Name"
          placeholder="In Production"
          value={form.name}
          onChangeText={(v) => setForm({ ...form, name: v })}
        />
        {!editing ? (
          <Field
            label="Code"
            placeholder="PRODUCTION"
            value={form.code}
            onChangeText={(v) => setForm({ ...form, code: v.toUpperCase().replace(/\s+/g, '_') })}
          />
        ) : null}

        <Text variant="label" tone="muted" style={styles.sheetLabel}>Colour</Text>
        <View style={styles.chipWrap}>
          {COLORS.map((color) => (
            <View
              key={color}
              style={[
                styles.swatch,
                { backgroundColor: color },
                form.color === color && styles.swatchActive,
              ]}
              onTouchEnd={() => setForm({ ...form, color })}
            />
          ))}
        </View>

        <Text variant="label" tone="muted" style={styles.sheetLabel}>Category</Text>
        <Text variant="tiny" tone="faint" style={{ marginBottom: spacing.sm }}>
          What this stage means to the system, whatever you name it.
        </Text>
        <View style={styles.chipWrap}>
          {CATEGORIES.map((category) => (
            <Chip
              key={category}
              label={category.replace('_', ' ')}
              selected={form.category === category}
              onPress={() => setForm({ ...form, category })}
            />
          ))}
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <Button
            title={editing ? 'Save stage' : 'Add stage'}
            loading={busy}
            disabled={!form.name.trim() || (!editing && !form.code.trim())}
            onPress={() =>
              run(async () => {
                if (editing) {
                  await api.updateStatus(editing.id, {
                    name: form.name.trim(),
                    color: form.color,
                    category: form.category as never,
                  });
                } else {
                  await api.addStatus(data.id, {
                    code: form.code.trim(),
                    name: form.name.trim(),
                    color: form.color,
                    category: form.category as never,
                    sortOrder: data.statuses.length,
                  });
                }
                setStatusSheet(false);
              })
            }
          />
          {editing ? (
            <>
              <Button
                title={editing.isInitial ? 'Already the start' : 'Make this the start'}
                variant="dark"
                disabled={editing.isInitial}
                onPress={() =>
                  run(async () => {
                    await api.updateStatus(editing.id, { isInitial: true });
                    setStatusSheet(false);
                  })
                }
                style={{ marginTop: spacing.md }}
              />
              <Button
                title="Delete stage"
                variant="danger"
                onPress={() =>
                  Alert.alert('Delete stage?', 'Only possible if nothing sits here.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () =>
                        run(async () => {
                          await api.removeStatus(editing.id);
                          setStatusSheet(false);
                        }),
                    },
                  ])
                }
                style={{ marginTop: spacing.md }}
              />
            </>
          ) : null}
        </View>
      </Sheet>

      <Sheet
        visible={Boolean(transitionFrom)}
        title={`Move out of ${transitionFrom?.name ?? ''}`}
        subtitle="Pick where this stage can go"
        onClose={() => setTransitionFrom(null)}>
        {data.statuses
          .filter((s) => s.id !== transitionFrom?.id)
          .filter(
            (s) =>
              !data.transitions.some(
                (t) => t.fromStatusId === transitionFrom?.id && t.toStatusId === s.id,
              ),
          )
          .map((target) => (
            <SheetOption
              key={target.id}
              label={target.name}
              accent={target.color}
              onPress={() =>
                run(async () => {
                  await api.saveWorkflowGraph(data.id, {
                    positions: data.statuses.map((s) => ({
                      id: s.id,
                      canvasX: s.canvasX,
                      canvasY: s.canvasY,
                    })),
                    transitions: [
                      ...data.transitions.map((t) => ({
                        fromStatusId: t.fromStatusId,
                        toStatusId: t.toStatusId,
                        label: t.label,
                        requiresNote: t.requiresNote,
                        allowedRoles: t.allowedRoles,
                      })),
                      {
                        fromStatusId: transitionFrom!.id,
                        toStatusId: target.id,
                        label: null,
                        requiresNote: false,
                        allowedRoles: [],
                      },
                    ],
                  });
                  setTransitionFrom(null);
                })
              }
            />
          ))}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wfRow: { marginBottom: spacing.md },
  hint: { marginBottom: spacing.lg },
  stage: { marginBottom: spacing.md },
  stageHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stageBar: { width: 4, height: 40, borderRadius: 2 },
  stageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  movesLabel: { marginTop: spacing.lg, marginBottom: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sheetLabel: { marginTop: spacing.lg, marginBottom: spacing.sm },
  swatch: { width: 38, height: 38, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: palette.text },
});

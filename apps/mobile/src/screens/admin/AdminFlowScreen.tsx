import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type { Workflow, WorkflowStatus, WorkflowTransition } from '@fas/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import {
  Button,
  Card,
  DataTable,
  Chip,
  ColorPicker,
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
/** What a new stage starts as, before anybody picks. */
const DEFAULT_COLOR = '#6B7785';

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
  const [busy, setBusy] = useState(false);

  const activeId = selectedId ?? workflows.data?.find((w) => w.isDefault)?.id ?? workflows.data?.[0]?.id;
  const workflow = useApi<Workflow | null>(
    useCallback(async () => (activeId ? api.workflow(activeId) : null), [activeId]),
    [activeId],
  );

  const [statusSheet, setStatusSheet] = useState(false);
  const [editing, setEditing] = useState<WorkflowStatus | null>(null);
  const [form, setForm] = useState({ code: '', name: '', color: DEFAULT_COLOR, category: 'OPEN' as string });

  const [transitionFrom, setTransitionFrom] = useState<WorkflowStatus | null>(null);
  const [expirySheet, setExpirySheet] = useState(false);
  const [quoteSheet, setQuoteSheet] = useState(false);
  const [lostSheet, setLostSheet] = useState(false);
  const [expiryDays, setExpiryDays] = useState('');

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

  const ordered = data.statuses.slice().sort((a, b) => a.sortOrder - b.sortOrder);

  /**
   * Dropping a move rewrites the whole graph, because that is the shape the API
   * takes — it replaces the transition set rather than deleting one edge.
   */
  /** Open the sheet on an existing stage, from wherever it was tapped. */
  const openStage = (status: WorkflowStatus) => {
    setEditing(status);
    setForm({
      code: status.code,
      name: status.name,
      color: status.color,
      category: status.category,
    });
    setStatusSheet(true);
  };

  const removeTransition = (from: WorkflowStatus, transition: WorkflowTransition) => {
    const target = statusById(transition.toStatusId);
    Alert.alert(
      'Remove this move?',
      `Orders will no longer be able to go from ${from.name} to ${target?.name}.`,
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
    );
  };
  const statusById = (id: string) => data.statuses.find((s) => s.id === id);

  /*
   * Stages a quote cannot move an enquiry out of.
   *
   * The rule obeys the drawing: an enquiry only moves to the quote stage where
   * the pipeline has an arrow from where it is sitting. That is the shop's
   * drawing being respected rather than worked around — but it is also why a
   * shop that quoted an enquiry on its first stage watched nothing happen and
   * had nothing to tell it why. The terminal stages are left out: an enquiry
   * that is already won or lost should not go back to Quoted.
   */
  const stranded = data.quoteStatusId
    ? data.statuses.filter(
        (status) =>
          status.id !== data.quoteStatusId &&
          status.category !== 'DONE' &&
          status.category !== 'CANCELLED' &&
          !data.transitions.some(
            (move) =>
              move.fromStatusId === status.id && move.toStatusId === data.quoteStatusId,
          ),
      )
    : [];

  return (
    <Screen refreshing={workflow.refreshing} onRefresh={workflow.refresh}>
      <ScreenHeader
        title="Status flow"
        subtitle={data.name}
        onBack={() => navigation.goBack()}
      />

      {/*
        Wraps rather than scrolls sideways. A horizontal ScrollView clips its
        children's shadows at both edges, so the last chip came out with a hard
        squared-off shadow hanging over the screen edge.
      */}
      <View style={styles.wfRow}>
        {(workflows.data?.length ?? 0) > 1
          ? workflows.data?.map((w) => (
              <Chip
                key={w.id}
                label={w.name}
                selected={w.id === activeId}
                onPress={() => setSelectedId(w.id)}
              />
            ))
          : null}
        {/* Not a workflow, but this is where an admin comes to think about
            stages — so the screen that picks which of them the home card
            counts is reached from here. */}
        <Chip icon="tune" label="Main card" onPress={() => navigation.navigate('MainCard')} />
      </View>

      <Text variant="tiny" tone="faint" style={styles.hint}>
        This graph is the rule the API enforces. A move with no arrow is refused.
        Tap a stage to rename it, recolour it or take it out.
      </Text>

      {data.kind === 'LEAD' ? (
        <Card
          tone="dark"
          style={styles.expiry}
          onPress={() => {
            setExpiryDays(data.leadExpiryDays ? String(data.leadExpiryDays) : '');
            setExpirySheet(true);
          }}>
          <View style={{ flex: 1 }}>
            <Text variant="label" tone="muted">Goes quiet after</Text>
            <Text variant="tiny" tone="faint">
              {data.leadExpiryDays
                ? `${data.leadExpiryDays} days untouched and an enquiry moves to the archive.`
                : 'Never. Enquiries stay on the board however long they sit.'}
            </Text>
          </View>
          <Text variant="h3" tone="accent">
            {data.leadExpiryDays ? `${data.leadExpiryDays}d` : 'Off'}
          </Text>
        </Card>
      ) : null}

      {/*
        Which stage means a quote has gone out.
        Configured rather than inferred: one shop's pipeline says "Quoted", the
        next says "Estimate sent", and a third quotes twice and cares only
        about the second.
      */}
      {data.kind === 'LEAD' ? (
        <Card
          tone="dark"
          style={styles.expiry}
          onPress={() => setQuoteSheet(true)}>
          <View style={{ flex: 1 }}>
            <Text variant="label" tone="muted">Sending a quote means</Text>
            <Text variant="tiny" tone="faint">
              {data.quoteStatusId
                ? 'An enquiry moves here when a quote is sent to the client.'
                : 'A quote is recorded against the enquiry but moves it nowhere.'}
            </Text>
            {/*
              The move obeys the drawing above, which the promise on its own
              did not say. A shop quoted an enquiry sitting on its first stage,
              watched it not move, and had nothing anywhere to tell it why: the
              pipeline simply had no arrow from there to Quoted. Naming the
              stages it cannot happen from turns a silent no-op into something
              somebody can go and draw.
            */}
            {stranded.length > 0 ? (
              <Text variant="tiny" style={styles.stranded} testID="quote-stranded">
                Not from {stranded.map((status) => status.name).join(', ')} — there is no
                arrow from {stranded.length === 1 ? 'it' : 'them'} to{' '}
                {statusById(data.quoteStatusId ?? '')?.name}. Draw one, or an enquiry
                sitting there stays put.
              </Text>
            ) : null}
          </View>
          <Text variant="body" bold tone={data.quoteStatusId ? 'accent' : 'faint'}>
            {statusById(data.quoteStatusId ?? '')?.name ?? 'No move'}
          </Text>
        </Card>
      ) : null}

      {data.kind === 'LEAD' ? (
        <Card tone="dark" style={styles.expiry} onPress={() => setLostSheet(true)}>
          <View style={{ flex: 1 }}>
            <Text variant="label" tone="muted">Turning a quote down means</Text>
            <Text variant="tiny" tone="faint">
              {data.lostStatusId
                ? 'An enquiry moves here when the client says no.'
                : 'A declined quote is recorded but moves the enquiry nowhere.'}
            </Text>
          </View>
          <Text variant="body" bold tone={data.lostStatusId ? 'accent' : 'faint'}>
            {statusById(data.lostStatusId ?? '')?.name ?? 'No move'}
          </Text>
        </Card>
      ) : null}

      <Button
        title="Open the canvas"
        variant="dark"
        icon={<Icon name="flow" size={17} color={palette.text} />}
        onPress={() => navigation.navigate('FlowCanvas', { workflowId: activeId })}
        style={{ marginBottom: spacing.md }}
      />

      <Button
        title="Add stage"
        icon={<Icon name="plus" size={17} color={palette.textOnAccent} />}
        onPress={() => {
          setEditing(null);
          setForm({ code: '', name: '', color: DEFAULT_COLOR, category: 'OPEN' });
          setStatusSheet(true);
        }}
        style={{ marginBottom: spacing.lg }}
      />

      {/*
        The stages are a table: a fixed set of facts repeated down the screen,
        which is exactly what somebody checking a flow is scanning.

        The moves out of a stage are the exception. As a column of wrapping
        chips they set the width of the whole table — 760 points of it, so on a
        phone the table scrolled sideways and every row stood as tall as its
        chips while the visible part of it sat empty. They belong under their
        stage, where they cost no width, and the facts above them fit the
        screen and can be read straight down.
      */}
      <Card tone="dark">
        <DataTable
          rows={ordered}
          empty="No stages yet — add one to start the flow"
          columns={[
            {
              key: 'stage',
              header: 'Stage',
              flex: 3,
              render: (status) => (
                /* The whole stage opens the editor, not just the Edit chip. */
                <View
                  style={styles.stageCell}
                  testID={`edit-stage-${status.id}`}
                  onTouchEnd={() => openStage(status)}>
                  <View style={[styles.stageBar, { backgroundColor: status.color }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.stageTitleRow}>
                      <Text variant="small" bold numberOfLines={1}>{status.name}</Text>
                      {status.isInitial ? (
                        <Pill label="START" color={palette.accent} small />
                      ) : null}
                      {status.isTerminal ? (
                        <Pill label="END" color={palette.surfaceLit} small />
                      ) : null}
                    </View>
                    <Text variant="tiny" tone="faint" numberOfLines={1}>
                      {status.code}
                      {status.parentId
                        ? ` · under ${statusById(status.parentId)?.name}`
                        : ''}
                    </Text>
                  </View>
                </View>
              ),
            },
            {
              key: 'category',
              header: 'Means',
              flex: 1.2,
              render: (status) => (
                <Text variant="tiny" tone="muted" numberOfLines={2}>
                  {status.category.replace('_', ' ').toLowerCase()}
                </Text>
              ),
            },
            {
              key: 'here',
              header: 'Here',
              flex: 0.8,
              align: 'right',
              render: (status) => (
                <Text variant="small" tone={status._count?.ordersAtStatus ? 'accent' : 'faint'} bold>
                  {status._count?.ordersAtStatus ?? 0}
                </Text>
              ),
            },
            {
              key: 'edit',
              header: '',
              flex: 0.45,
              align: 'right',
              /*
               * A pencil rather than the word: the column is a thumb wide now
               * that the table fits the screen, and "Edit" wrapped to "Edi/t"
               * inside it.
               */
              render: (status) => (
                <View
                  testID={`edit-chip-${status.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${status.name}`}
                  style={styles.editButton}
                  onTouchEnd={() => openStage(status)}>
                  <Icon name="edit" size={16} color={palette.textMuted} />
                </View>
              ),
            },
          ]}
          detail={(status) => (
            <View style={styles.moves}>
              <Text variant="tiny" tone="faint" style={styles.movesLabel}>
                Moves out — tap one to remove it
              </Text>
              <View style={styles.chipWrap}>
                {outgoing(status.id).length === 0 ? (
                  <Text variant="tiny" tone="faint">Nothing leaves here</Text>
                ) : (
                  outgoing(status.id).map((transition) => {
                    const target = statusById(transition.toStatusId);
                    return (
                      <Chip
                        key={transition.id}
                        label={`→ ${target?.name ?? '?'}${transition.requiresNote ? ' *' : ''}`}
                        accent={target?.color}
                        selected
                        onPress={() => removeTransition(status, transition)}
                      />
                    );
                  })
                )}
                <Chip label="+ Move" onPress={() => setTransitionFrom(status)} />
              </View>
            </View>
          )}
        />
      </Card>

      <Sheet
        visible={statusSheet}
        title={editing ? `Edit ${editing.name}` : 'Add stage'}
        onClose={() => setStatusSheet(false)}>
        <Field
          label="Name"
          placeholder="In Production"
          value={form.name}
          onChangeText={(v) => setForm((current) => ({ ...current, name: v }))}
        />
        {!editing ? (
          <Field
            label="Code"
            placeholder="PRODUCTION"
            value={form.code}
            onChangeText={(v) => setForm((current) => ({ ...current, code: v.toUpperCase().replace(/\s+/g, '_') }))}
          />
        ) : null}

        {/* Any colour at all: a shop has its own idea of what a stage looks
            like, and seven of ours was never going to cover it. */}
        <View style={styles.sheetLabel}>
          <ColorPicker
            value={form.color}
            onChange={(color) => setForm((current) => ({ ...current, color }))}
          />
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
              onPress={() => setForm((current) => ({ ...current, category }))}
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
        visible={expirySheet}
        title="Goes quiet after"
        subtitle="An enquiry nobody has touched for this long moves to the archive"
        onClose={() => setExpirySheet(false)}>
        <Text variant="small" tone="muted" style={{ marginTop: 0 }}>
          Touching one — a note, a move, a call logged — starts the clock again,
          so this only ever catches the ones that were genuinely dropped. Leave
          it empty to keep every enquiry on the board for good.
        </Text>
        <Field
          label="Days"
          placeholder="30"
          value={expiryDays}
          onChangeText={setExpiryDays}
          keyboardType="number-pad"
          hint={
            expiryDays.trim() === '' || Number(expiryDays) === 0
              ? 'Nothing will be archived.'
              : `Archived after ${Number(expiryDays)} days untouched.`
          }
        />
        <Button
          title="Save"
          loading={busy}
          onPress={() =>
            run(async () => {
              await api.updateWorkflow(data.id, {
                leadExpiryDays: expiryDays.trim() === '' ? null : Number(expiryDays),
              });
              setExpirySheet(false);
            })
          }
        />
      </Sheet>

      <Sheet
        visible={quoteSheet}
        title="Sending a quote means"
        subtitle="Where an enquiry goes when a quote reaches the client"
        onClose={() => setQuoteSheet(false)}>
        <Text variant="small" tone="muted" style={{ marginTop: 0 }}>
          The move is made through this same graph, so an enquiry only moves
          where the pipeline allows it. The quote is recorded either way.
        </Text>
        <SheetOption
          label="Nothing — leave it where it is"
          selected={!data.quoteStatusId}
          onPress={() =>
            run(async () => {
              await api.updateWorkflow(data.id, { quoteStatusId: null });
              setQuoteSheet(false);
            })
          }
        />
        {ordered.map((status) => (
          <SheetOption
            key={status.id}
            label={status.name}
            accent={status.color}
            selected={data.quoteStatusId === status.id}
            onPress={() =>
              run(async () => {
                await api.updateWorkflow(data.id, { quoteStatusId: status.id });
                setQuoteSheet(false);
              })
            }
          />
        ))}
      </Sheet>

      <Sheet
        visible={lostSheet}
        title="Turning a quote down means"
        subtitle="Where an enquiry goes when the client says no"
        onClose={() => setLostSheet(false)}>
        <Text variant="small" tone="muted" style={{ marginTop: 0 }}>
          Some shops close it; others keep it and work it again. The move is made
          through this same graph, so it only happens where the pipeline allows.
        </Text>
        <SheetOption
          label="Nothing — leave it where it is"
          selected={!data.lostStatusId}
          onPress={() =>
            run(async () => {
              await api.updateWorkflow(data.id, { lostStatusId: null });
              setLostSheet(false);
            })
          }
        />
        {ordered.map((status) => (
          <SheetOption
            key={status.id}
            label={status.name}
            accent={status.color}
            selected={data.lostStatusId === status.id}
            onPress={() =>
              run(async () => {
                await api.updateWorkflow(data.id, { lostStatusId: status.id });
                setLostSheet(false);
              })
            }
          />
        ))}
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
  stranded: { color: palette.warning, marginTop: spacing.xs },
  wfRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  hint: { marginBottom: spacing.lg },
  expiry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  stage: { marginBottom: spacing.md },
  stageHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  /* The stage cell: its colour bar and the name beside it, no outer margin. */
  stageCell: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stageBar: { width: 4, height: 30, borderRadius: 2 },
  stageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  editButton: { padding: spacing.xs },
  moves: { paddingLeft: spacing.md },
  movesLabel: {
    marginBottom: spacing.xs,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sheetLabel: { marginTop: spacing.lg, marginBottom: spacing.sm },
  swatch: { width: 38, height: 38, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: palette.text },
});

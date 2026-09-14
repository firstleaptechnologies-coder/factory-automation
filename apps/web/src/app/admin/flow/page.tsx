'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Connection,
  Controls,
  Edge,
  Handle,
  MarkerType,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Workflow, WorkflowStatus } from '@fas/shared';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { Button, Chip, Field, Select, Sheet, SheetOption } from '@/ui';
import { ColorPicker } from '@/components/ColorPicker';

/**
 * The status flow builder.
 *
 * Statuses are nodes, allowed moves are edges, and the graph on screen is the
 * rule the API enforces — not a diagram of it. Dragging a node saves its
 * position; drawing an arrow makes that move legal; deleting one makes it
 * illegal. Nothing is written until Save, so a half-drawn flow never strands
 * orders in a status they cannot leave.
 */

function StatusNode({ data }: NodeProps) {
  const status = data.status as WorkflowStatus;
  return (
    <div
      className={`status-node${status.parentId ? ' child' : ''}`}
      style={{ borderColor: status.color }}>
      <Handle type="target" position={Position.Left} />
      <div className="node-name">{status.name}</div>
      <div className="node-meta">
        {status.category.replace('_', ' ')}
        {status.isInitial ? ' · start' : ''}
        {status.isTerminal ? ' · end' : ''}
      </div>
      {typeof data.orderCount === 'number' && data.orderCount > 0 ? (
        <div className="node-meta" style={{ color: status.color }}>
          {data.orderCount} order{data.orderCount === 1 ? '' : 's'}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { status: StatusNode };

/** What a new stage starts as, before anybody picks. */
const DEFAULT_COLOR = '#6B7785';

const STAGE_CATEGORIES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;

export default function FlowBuilderPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'success' | 'danger' } | null>(null);
  const [saving, setSaving] = useState(false);
  const [expiryDays, setExpiryDays] = useState('');
  const [savingExpiry, setSavingExpiry] = useState(false);

  /** The stage being written. Null when the sheet is shut. */
  const [stageSheet, setStageSheet] = useState<{ editing: WorkflowStatus | null } | null>(null);

  /** The stage a new move is being drawn out of. Null when that sheet is shut. */
  const [moveFrom, setMoveFrom] = useState<WorkflowStatus | null>(null);
  const [stageForm, setStageForm] = useState({
    code: '',
    name: '',
    color: DEFAULT_COLOR,
    category: 'OPEN',
  });
  const [savingStage, setSavingStage] = useState(false);

  /*
   * Which workflow, and the graph itself, are loaded separately.
   *
   * Together they re-ran: choosing the workflow set state the loader depended
   * on, so opening the page fetched the flow twice and the second arrival
   * quietly threw away anything drawn in the gap.
   */
  const load = useCallback(async (id: string) => {
    const wf = await api.workflow(id);
    setWorkflow(wf);
    setNodes(
      wf.statuses.map((status) => ({
        id: status.id,
        type: 'status',
        position: { x: status.canvasX, y: status.canvasY },
        data: { status, orderCount: status._count?.ordersAtStatus },
      })),
    );
    setEdges(
      wf.transitions.map((transition) => ({
        id: transition.id,
        source: transition.fromStatusId,
        target: transition.toStatusId,
        label: transition.label ?? (transition.requiresNote ? 'note required' : undefined),
        markerEnd: { type: MarkerType.ArrowClosed },
        data: {
          requiresNote: transition.requiresNote,
          allowedRoles: transition.allowedRoles,
          label: transition.label,
        },
        style: transition.requiresNote ? { strokeDasharray: '6 4' } : undefined,
      })),
    );
    setDirty(false);
    setExpiryDays(wf.leadExpiryDays ? String(wf.leadExpiryDays) : '');
  }, [setNodes, setEdges]);

  const failed = (e: unknown) =>
    setMessage({
      text: e instanceof Error ? e.message : 'Could not load the flow',
      tone: 'danger',
    });

  // Orders and leads are both driven by workflows, so the same canvas edits
  // either one — the picker chooses which.
  useEffect(() => {
    api
      .workflows()
      .then((all) => {
        setWorkflows(all);
        const targetId = all.find((w) => w.isDefault)?.id ?? all[0]?.id;
        if (!targetId) throw new Error('No workflow is configured');
        setSelectedId((current) => current || targetId);
      })
      .catch(failed);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    load(selectedId).catch(failed);
  }, [selectedId, load]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return;
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: `${connection.source}->${connection.target}`,
            markerEnd: { type: MarkerType.ArrowClosed },
            data: { requiresNote: false, allowedRoles: [] },
          },
          current,
        ),
      );
      setDirty(true);
    },
    [setEdges],
  );

  /*
   * The moves, as a list beside the canvas.
   *
   * Drawing an arrow between two handles is quick with a mouse and impossible
   * to discover — the app has offered "+ Move" on every stage from the start,
   * and the two are meant to be the same product. Both read and write the
   * canvas's own edges, so a move added here is drawn on the graph at once and
   * lands in the same Save flow, rather than being a second way to write the
   * same rule.
   */
  const outgoing = (statusId: string) => edges.filter((edge) => edge.source === statusId);

  const statusById = (id: string) => workflow?.statuses.find((status) => status.id === id);

  /*
   * Stages with no arrow into the quote stage. An enquiry sitting on one of
   * these does not move when its quote is sent — the move is made through this
   * graph and the graph refuses it — so the promise above has to say where it
   * does not hold. Read off the canvas's own edges, so a move drawn but not yet
   * saved already counts.
   */
  const stranded = workflow?.quoteStatusId
    ? workflow.statuses.filter(
        (status) =>
          status.id !== workflow.quoteStatusId &&
          status.category !== 'DONE' &&
          status.category !== 'CANCELLED' &&
          !edges.some(
            (edge) => edge.source === status.id && edge.target === workflow.quoteStatusId,
          ),
      )
    : [];

  const addMove = (from: WorkflowStatus, to: WorkflowStatus) => {
    setEdges((current) =>
      addEdge(
        {
          source: from.id,
          target: to.id,
          id: `${from.id}->${to.id}`,
          markerEnd: { type: MarkerType.ArrowClosed },
          data: { requiresNote: false, allowedRoles: [] },
        },
        current,
      ),
    );
    setDirty(true);
    setMoveFrom(null);
  };

  const removeMove = (edge: Edge) => {
    const from = statusById(edge.source)?.name ?? 'this stage';
    const to = statusById(edge.target)?.name ?? 'that one';
    if (!window.confirm(`Remove this move? Orders will no longer go from ${from} to ${to}.`)) {
      return;
    }
    setEdges((current) => current.filter((one) => one.id !== edge.id));
    setDirty(true);
  };

  const save = async () => {
    if (!workflow) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.saveWorkflowGraph(workflow.id, {
        positions: nodes.map((node) => ({
          id: node.id,
          canvasX: Math.round(node.position.x),
          canvasY: Math.round(node.position.y),
        })),
        transitions: edges.map((edge) => ({
          fromStatusId: edge.source,
          toStatusId: edge.target,
          label: (edge.data?.label as string) ?? null,
          requiresNote: Boolean(edge.data?.requiresNote),
          allowedRoles: (edge.data?.allowedRoles as never) ?? [],
        })),
      });
      await load(workflow.id);
      setMessage({ text: 'Flow saved. Orders now follow this graph.', tone: 'success' });
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : 'Could not save the flow',
        tone: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  const openStage = (status: WorkflowStatus | null) => {
    setStageForm(
      status
        ? {
            code: status.code,
            name: status.name,
            color: status.color,
            category: status.category,
          }
        : { code: '', name: '', color: DEFAULT_COLOR, category: 'OPEN' },
    );
    setStageSheet({ editing: status });
  };

  /** Add a stage, or restate an existing one. The code never changes: orders
   *  already reference it. */
  const saveStage = async () => {
    if (!workflow || !stageSheet) return;
    setSavingStage(true);
    setMessage(null);
    try {
      if (stageSheet.editing) {
        await api.updateStatus(stageSheet.editing.id, {
          name: stageForm.name.trim(),
          color: stageForm.color,
          category: stageForm.category as never,
        });
      } else {
        await api.addStatus(workflow.id, {
          code: stageForm.code.trim(),
          name: stageForm.name.trim(),
          color: stageForm.color,
          category: stageForm.category as never,
          sortOrder: workflow.statuses.length,
        });
      }
      setStageSheet(null);
      await load(workflow.id);
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Could not save', tone: 'danger' });
    } finally {
      setSavingStage(false);
    }
  };

  const makeInitial = async (status: WorkflowStatus) => {
    if (!workflow) return;
    setSavingStage(true);
    try {
      await api.updateStatus(status.id, { isInitial: true });
      setStageSheet(null);
      await load(workflow.id);
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Could not save', tone: 'danger' });
    } finally {
      setSavingStage(false);
    }
  };

  const removeStage = async (status: WorkflowStatus) => {
    if (!workflow) return;
    if (!window.confirm(`Delete ${status.name}? Only possible if nothing sits here.`)) return;
    setSavingStage(true);
    try {
      await api.removeStatus(status.id);
      setStageSheet(null);
      await load(workflow.id);
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Could not delete', tone: 'danger' });
    } finally {
      setSavingStage(false);
    }
  };

  /**
   * Which stage means a quote has gone out.
   *
   * Configured rather than inferred: one shop's pipeline says "Quoted", the
   * next says "Estimate sent", and a third quotes twice and cares only about
   * the second.
   */
  const saveLostStage = async (statusId: string) => {
    if (!workflow) return;
    setMessage(null);
    try {
      await api.updateWorkflow(workflow.id, { lostStatusId: statusId || null });
      await load(workflow.id);
      setMessage({
        text: statusId
          ? 'Saved. A quote turned down moves the enquiry there.'
          : 'Saved. A quote turned down is recorded but moves nothing.',
        tone: 'success',
      });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Could not save', tone: 'danger' });
    }
  };

  const saveQuoteStage = async (statusId: string) => {
    if (!workflow) return;
    setMessage(null);
    try {
      await api.updateWorkflow(workflow.id, { quoteStatusId: statusId || null });
      await load(workflow.id);
      setMessage({
        text: statusId
          ? 'Saved. Sending a quote moves the enquiry there.'
          : 'Saved. A quote is recorded but moves nothing.',
        tone: 'success',
      });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Could not save', tone: 'danger' });
    }
  };

  const saveExpiry = async () => {
    if (!workflow) return;
    setSavingExpiry(true);
    setMessage(null);
    try {
      await api.updateWorkflow(workflow.id, {
        leadExpiryDays: expiryDays.trim() === '' ? null : Number(expiryDays),
      });
      await load(workflow.id);
      setMessage({ text: 'Saved. Quiet enquiries move to the archive.', tone: 'success' });
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : 'Could not save',
        tone: 'danger',
      });
    } finally {
      setSavingExpiry(false);
    }
  };

  const selectedEdgeHint = useMemo(
    () => 'Drag from a node’s right handle to another node’s left handle to allow that move.',
    [],
  );

  return (
    <Shell>
      <div className="legacy">
      <h1 className="page-title">Status flow</h1>
      <p className="page-sub">
        {workflow ? workflow.name : 'Loading…'} — this graph is what the API enforces.
      </p>

      <div className="row" style={{ marginBottom: 12 }}>
        <div style={{ width: 300 }}>
          <Select
            label="Editing"
            value={selectedId}
            onChange={(value) => {
              setSelectedId(value);
              setDirty(false);
            }}
            options={workflows.map((w) => ({
              value: w.id,
              label: w.name,
              description: w.kind === 'LEAD' ? 'leads' : 'orders',
            }))}
          />
        </div>
        <div className="spacer" />
        {/* Not a workflow, but this is where an admin comes to think about
            stages — so the screen that picks which of them the home card
            counts is reached from here. */}
        <button type="button" onClick={() => router.push('/admin/main-card')}>
          Main card
        </button>
      </div>

      {workflow?.kind === 'LEAD' ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="toolbar">
            <div>
              <h3 style={{ margin: 0 }}>Goes quiet after</h3>
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                An enquiry nobody has touched for this long moves to the archive.
                Touching one — a note, a move, a call logged — starts the clock
                again. Leave it empty and nothing is ever archived.
              </p>
            </div>
            <div className="spacer" />
            {/* The field and its button are a row of their own: the toolbar
                stretches what it holds to the height of the paragraph beside
                it, which left Save floating well above the box it saves. */}
            <div className="field-row" style={{ flex: '0 0 auto' }}>
              <div style={{ width: 110, flex: '0 0 110px', minWidth: 110 }}>
                <label htmlFor="expiry">Days</label>
                <input
                  id="expiry"
                  inputMode="numeric"
                  placeholder="30"
                  value={expiryDays}
                  onChange={(event) => setExpiryDays(event.target.value)}
                />
              </div>
              <button
                className="row-action"
                disabled={savingExpiry}
                onClick={() =>
                  void saveExpiry()
                }>
                {savingExpiry ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          <div className="divider" />

          <div className="toolbar" style={{ marginBottom: 0 }}>
            <div>
              <h3 style={{ margin: 0 }}>Sending a quote means</h3>
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                Where an enquiry goes when a quote reaches the client. The move is
                made through this same graph, so it only happens where the pipeline
                allows it — the quote is recorded either way.
              </p>
              {stranded.length > 0 ? (
                <p
                  className="warning"
                  style={{ fontSize: 12, margin: '4px 0 0' }}
                  data-testid="quote-stranded"
                >
                  Not from {stranded.map((status) => status.name).join(', ')} — there is
                  no arrow from {stranded.length === 1 ? 'it' : 'them'} to{' '}
                  {statusById(workflow.quoteStatusId ?? '')?.name}. Draw one, or an
                  enquiry sitting there stays put.
                </p>
              ) : null}
            </div>
            <div className="spacer" />
            <div style={{ width: 260 }}>
              <Select
                label="Stage"
                value={workflow.quoteStatusId ?? ''}
                onChange={(value) => void saveQuoteStage(value)}
                options={[
                  { value: '', label: 'Nothing — leave it where it is' },
                  ...workflow.statuses.map((status) => ({
                    value: status.id,
                    label: status.name,
                    description: status.category.replace('_', ' ').toLowerCase(),
                  })),
                ]}
              />
            </div>
          </div>

          <div className="toolbar" style={{ marginBottom: 0, marginTop: 'var(--s-md)' }}>
            <div>
              <h3 style={{ margin: 0 }}>Turning a quote down means</h3>
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                Where an enquiry goes when the client says no. Some shops call it
                Lost and close it; others keep it and work it again — so it moves
                only where you say it should, and only where the pipeline allows.
              </p>
            </div>
            <div className="spacer" />
            <div style={{ width: 260 }}>
              <Select
                label="Stage"
                value={workflow.lostStatusId ?? ''}
                onChange={(value) => void saveLostStage(value)}
                options={[
                  { value: '', label: 'Nothing — leave it where it is' },
                  ...workflow.statuses.map((status) => ({
                    value: status.id,
                    label: status.name,
                    description: status.category.replace('_', ' ').toLowerCase(),
                  })),
                ]}
              />
            </div>
          </div>
        </div>
      ) : null}

      {message ? <div className={`banner ${message.tone}`}>{message.text}</div> : null}

      <div className="toolbar">
        <span className="muted" style={{ fontSize: 12 }}>{selectedEdgeHint}</span>
        <div className="spacer" />
        {dirty ? <span className="muted" style={{ fontSize: 12 }}>Unsaved changes</span> : null}
        <button onClick={() => void load(selectedId).catch(failed)}>Revert</button>
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save flow'}
        </button>
      </div>

      <div className="flow-wrap">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={(changes) => {
            onNodesChange(changes);
            if (changes.some((c) => c.type === 'position' && c.dragging === false)) setDirty(true);
          }}
          onEdgesChange={(changes) => {
            onEdgesChange(changes);
            if (changes.some((c) => c.type === 'remove')) setDirty(true);
          }}
          onConnect={onConnect}
          fitView
          proOptions={{ hideAttribution: false }}>
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Statuses</h3>
          <div className="spacer" />
          <button className="primary" onClick={() => openStage(null)}>
            + Add stage
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Dashed borders are sub-statuses. A status holding orders cannot be deleted until
          those orders are moved. Click a stage to rename it, recolour it or take it out.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Status</th><th>Category</th><th>Parent</th><th className="num">Orders</th><th>Flags</th><th>Moves out</th><th />
            </tr>
          </thead>
          <tbody>
            {workflow?.statuses.map((status) => (
              <tr
                key={status.id}
                data-testid={`stage-${status.id}`}
                style={{ cursor: 'pointer' }}
                onClick={() => openStage(status)}>
                <td>
                  <span
                    className="pill"
                    style={{ background: status.color, marginRight: 8 }}>
                    {status.code}
                  </span>
                  {status.name}
                </td>
                <td className="muted">{status.category.replace('_', ' ')}</td>
                <td className="muted">
                  {workflow.statuses.find((s) => s.id === status.parentId)?.name ?? '—'}
                </td>
                <td className="num">{status._count?.ordersAtStatus ?? 0}</td>
                <td className="muted">
                  {[status.isInitial ? 'start' : null, status.isTerminal ? 'end' : null]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </td>
                <td onClick={(event) => event.stopPropagation()}>
                  <div className="chip-row" data-testid={`moves-${status.id}`}>
                    {outgoing(status.id).map((edge) => (
                      <Chip
                        key={edge.id}
                        selected
                        label={`→ ${statusById(edge.target)?.name ?? '?'}${
                          edge.data?.requiresNote ? ' *' : ''
                        }`}
                        onClick={() => removeMove(edge)}
                      />
                    ))}
                    {outgoing(status.id).length === 0 ? (
                      <span className="t-tiny faint">Nothing leaves here</span>
                    ) : null}
                    <Chip label="+ Move" onClick={() => setMoveFrom(status)} />
                  </div>
                </td>
                <td>
                  <button onClick={(event) => { event.stopPropagation(); openStage(status); }}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet
        open={Boolean(moveFrom)}
        title={`Move out of ${moveFrom?.name ?? ''}`}
        subtitle="Pick where this stage can go"
        onClose={() => setMoveFrom(null)}>
        {(workflow?.statuses ?? [])
          .filter((target) => target.id !== moveFrom?.id)
          .filter(
            (target) =>
              !edges.some((edge) => edge.source === moveFrom?.id && edge.target === target.id),
          )
          .map((target) => (
            <SheetOption
              key={target.id}
              label={target.name}
              description={target.category.replace('_', ' ').toLowerCase()}
              accent={target.color}
              onClick={() => addMove(moveFrom!, target)}
            />
          ))}
        {(workflow?.statuses ?? []).filter(
          (target) =>
            target.id !== moveFrom?.id &&
            !edges.some((edge) => edge.source === moveFrom?.id && edge.target === target.id),
        ).length === 0 ? (
          <p className="t-small muted">This stage can already go everywhere.</p>
        ) : null}
      </Sheet>

      <Sheet
        open={Boolean(stageSheet)}
        title={stageSheet?.editing ? `Edit ${stageSheet.editing.name}` : 'Add stage'}
        subtitle={
          stageSheet?.editing
            ? 'Orders already reference the code, so it stays as it is'
            : 'A stage the flow can move an order to'
        }
        onClose={() => setStageSheet(null)}>
        <Field
          label="Name"
          placeholder="In Production"
          value={stageForm.name}
          onChange={(value) => setStageForm((current) => ({ ...current, name: value }))}
          autoFocus
        />
        {!stageSheet?.editing ? (
          <Field
            label="Code"
            placeholder="PRODUCTION"
            value={stageForm.code}
            onChange={(value) =>
              setStageForm((current) => ({ ...current, code: value.toUpperCase().replace(/\s+/g, '_') }))
            }
            hint="How the API refers to it. It cannot be changed later."
          />
        ) : null}

        {/* Any colour at all: a shop has its own idea of what a stage looks
            like, and seven of ours was never going to cover it. */}
        <div style={{ marginBottom: 'var(--s-lg)' }}>
          <ColorPicker
            value={stageForm.color}
            onChange={(colour) => setStageForm((current) => ({ ...current, color: colour }))}
          />
        </div>

        <span className="field-label">What it means to the system</span>
        <div className="wrap" style={{ marginBottom: 'var(--s-lg)' }}>
          {STAGE_CATEGORIES.map((category) => (
            <Chip
              key={category}
              label={category.replace('_', ' ')}
              selected={stageForm.category === category}
              onClick={() => setStageForm((current) => ({ ...current, category }))}
            />
          ))}
        </div>

        <Button
          title={stageSheet?.editing ? 'Save stage' : 'Add stage'}
          block
          loading={savingStage}
          disabled={!stageForm.name.trim() || (!stageSheet?.editing && !stageForm.code.trim())}
          onClick={saveStage}
        />

        {stageSheet?.editing ? (
          <div className="stack-sm" style={{ marginTop: 'var(--s-md)' }}>
            <Button
              title={stageSheet.editing.isInitial ? 'Already the start' : 'Make this the start'}
              variant="dark"
              block
              disabled={stageSheet.editing.isInitial || savingStage}
              onClick={() => void makeInitial(stageSheet.editing!)}
            />
            <Button
              title="Delete stage"
              variant="danger"
              block
              disabled={savingStage}
              onClick={() => void removeStage(stageSheet.editing!)}
            />
          </div>
        ) : null}
      </Sheet>
    </div>
    </Shell>
  );
}

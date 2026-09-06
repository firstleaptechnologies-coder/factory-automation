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
import type { Workflow, WorkflowStatus } from '@decor/shared';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

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

export default function FlowBuilderPage() {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'success' | 'danger' } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const wf = await api.defaultWorkflow();
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
  }, [setNodes, setEdges]);

  useEffect(() => {
    load().catch((e) =>
      setMessage({ text: e instanceof Error ? e.message : 'Could not load the flow', tone: 'danger' }),
    );
  }, [load]);

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
      await load();
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

  const selectedEdgeHint = useMemo(
    () => 'Drag from a node’s right handle to another node’s left handle to allow that move.',
    [],
  );

  return (
    <Shell>
      <h1 className="page-title">Status flow</h1>
      <p className="page-sub">
        {workflow ? workflow.name : 'Loading…'} — this graph is what the API enforces.
      </p>

      {message ? <div className={`banner ${message.tone}`}>{message.text}</div> : null}

      <div className="toolbar">
        <span className="muted" style={{ fontSize: 12 }}>{selectedEdgeHint}</span>
        <div className="spacer" />
        {dirty ? <span className="muted" style={{ fontSize: 12 }}>Unsaved changes</span> : null}
        <button onClick={() => void load()}>Revert</button>
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
        <h3>Statuses</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: -8 }}>
          Dashed borders are sub-statuses. A status holding orders cannot be deleted until
          those orders are moved.
        </p>
        <table>
          <thead>
            <tr>
              <th>Status</th><th>Category</th><th>Parent</th><th className="num">Orders</th><th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {workflow?.statuses.map((status) => (
              <tr key={status.id}>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

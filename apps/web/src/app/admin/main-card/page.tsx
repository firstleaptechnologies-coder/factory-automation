'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Workflow, WorkflowStatus } from '@decor/shared';
import { HOME_CARD_LIMIT } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Shell } from '@/components/Shell';
import { Button, Card, Icon, Loader, PageHead, SectionHead } from '@/ui';

export default function MainCardPage() {
  return (
    <Shell>
      <MainCard />
    </Shell>
  );
}

/**
 * What the home card counts.
 *
 * The card holds five stages and a shop watches different ones — a joinery
 * lives in Design and Production, a stone unit in Cutting and Polishing. So the
 * five are chosen here rather than derived from the flow, and their order on
 * this screen is their order on the card.
 */
function MainCard() {
  const router = useRouter();
  const workflow = useApi<Workflow>(() => api.defaultWorkflow(), []);

  const [chosen, setChosen] = useState<WorkflowStatus[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workflow.data) return;
    setChosen(
      workflow.data.statuses
        .filter((status) => status.homeCardOrder !== null && status.homeCardOrder !== undefined)
        .sort((a, b) => (a.homeCardOrder ?? 0) - (b.homeCardOrder ?? 0)),
    );
    setDirty(false);
  }, [workflow.data]);

  if (workflow.loading) return <Loader label="Loading the flow" />;
  const data = workflow.data;
  if (!data) return null;

  const chosenIds = new Set(chosen.map((status) => status.id));
  const rest = data.statuses.filter((status) => !chosenIds.has(status.id));
  const full = chosen.length >= HOME_CARD_LIMIT;

  const add = (status: WorkflowStatus) => {
    if (full) return;
    setChosen((current) => [...current, status]);
    setDirty(true);
  };

  const remove = (id: string) => {
    setChosen((current) => current.filter((status) => status.id !== id));
    setDirty(true);
  };

  /** Drop the stage being dragged in front of the one it was let go over. */
  const dropOn = (targetId: string) => {
    if (!dragging || dragging === targetId) return;
    setChosen((current) => {
      const from = current.findIndex((status) => status.id === dragging);
      const to = current.findIndex((status) => status.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = current.slice();
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.setHomeCardStatuses(data.id, chosen.map((status) => status.id));
      router.push('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title="Main card"
        subtitle="What the home screen counts"
        action={
          <Button title="Save the card" loading={busy} disabled={!dirty} onClick={save} />
        }
      />

      <p className="t-small muted" style={{ marginTop: 0 }}>
        Up to {HOME_CARD_LIMIT} stages, counted live on the home card. Drag a stage to
        move it up or down — the order here is the order there.
      </p>

      {error ? (
        <Card size="sm" style={{ marginBottom: 'var(--s-lg)' }}>
          <span className="t-small danger">{error}</span>
        </Card>
      ) : null}

      <SectionHead title={`On the card · ${chosen.length}/${HOME_CARD_LIMIT}`} />
      {chosen.length === 0 ? (
        <Card size="sm">
          <span className="t-small muted">Nothing on the card yet. Add a stage from below.</span>
        </Card>
      ) : (
        <div className="stack-sm">
          {chosen.map((status, index) => (
            <div
              key={status.id}
              data-testid={`chosen-${status.id}`}
              draggable
              onDragStart={() => setDragging(status.id)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropOn(status.id)}>
              <Card size="sm" className="row-card">
                <div className="row">
                  {/* The grip. The whole row is draggable; this says so. */}
                  <Icon name="filter" size={16} color="var(--text-faint)" />
                  <span className="dot" style={{ background: status.color }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="t-body bold truncate">{status.name}</div>
                    <div className="t-tiny faint">
                      {status._count?.ordersAtStatus ?? 0} here now
                    </div>
                  </div>
                  <span className="t-tiny accent bold">{index + 1}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Take ${status.name} off the card`}
                    onClick={() => remove(status.id)}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}

      <SectionHead title="Not on the card" />
      {rest.length === 0 ? (
        <p className="t-tiny faint">Every stage in the flow is on the card.</p>
      ) : (
        <div className="stack-sm">
          {rest.map((status) => (
            <Card
              key={status.id}
              size="sm"
              className="row-card"
              onClick={full ? undefined : () => add(status)}>
              <div className="row">
                <span className="dot" style={{ background: status.color }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={`t-body truncate${full ? ' faint' : ' bold'}`}>{status.name}</div>
                  <div className="t-tiny faint">
                    {status._count?.ordersAtStatus ?? 0} here now
                  </div>
                </div>
                <Icon name="plus" size={16} color={full ? 'var(--text-faint)' : 'var(--accent)'} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {full ? (
        <p className="t-tiny faint">The card is full. Take one off to make room.</p>
      ) : null}
    </>
  );
}

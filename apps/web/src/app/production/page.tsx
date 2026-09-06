'use client';

import {useState} from 'react';
import type {Job} from '@decor/shared';
import {formatDate, formatDuration} from '@decor/shared';
import {Shell} from '@/components/Shell';
import {Pill, ErrorBox} from '@/components/bits';
import {api} from '@/lib/api';
import {useApi} from '@/lib/useApi';

/** Planner's view: every machine's queue side by side, jobs actionable in place. */
export default function ProductionPage() {
  const {data, error, loading, reload} = useApi(() => api.machineBoard());
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const act = async (jobId: string, action: () => Promise<unknown>) => {
    setBusy(jobId);
    setActionError(null);
    try {
      await action();
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const renderJob = (job: Job) => (
    <div
      key={job.id}
      className="card"
      style={{marginBottom: 8, background: 'var(--surface-alt)'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <strong>{job.code}</strong>
        <Pill status={job.status} />
      </div>
      <div className="muted" style={{fontSize: 12, marginTop: 4}}>
        {job.material?.name} · qty {job.quantity}
      </div>
      {job.order ? (
        <div className="muted" style={{fontSize: 12}}>
          {job.order.code} · {job.order.customer?.name} · due {formatDate(job.order.dueDate)}
        </div>
      ) : null}
      {job.estimatedMinutes ? (
        <div className="muted" style={{fontSize: 12}}>
          est. {formatDuration(job.estimatedMinutes)}
        </div>
      ) : null}
      <div style={{display: 'flex', gap: 6, marginTop: 8}}>
        {job.status === 'RUNNING' ? (
          <>
            <button disabled={busy === job.id} onClick={() => act(job.id, () => api.pauseJob(job.id))}>
              Pause
            </button>
            <button
              className="success"
              disabled={busy === job.id}
              onClick={() => act(job.id, () => api.completeJob(job.id))}>
              Complete
            </button>
          </>
        ) : (
          <button
            className="primary"
            disabled={busy === job.id}
            onClick={() => act(job.id, () => api.startJob(job.id))}>
            Start
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Shell>
      <h1 className="page-title">Production</h1>
      <p className="page-sub">Live queue for each machine.</p>
      <ErrorBox message={error ?? actionError} />

      {loading || !data ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="grid cols-4">
          {data.map(machine => (
            <div key={machine.id} className="card">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
                <div>
                  <strong>{machine.name}</strong>
                  <div className="muted" style={{fontSize: 12}}>{machine.code}</div>
                </div>
                <Pill status={machine.status} />
              </div>

              {machine.queue.length === 0 ? (
                <p className="muted" style={{fontSize: 13}}>Nothing queued.</p>
              ) : (
                machine.queue.map(renderJob)
              )}
            </div>
          ))}
        </div>
      )}

      <button style={{marginTop: 14}} onClick={reload}>Refresh</button>
    </Shell>
  );
}

'use client';

import Link from 'next/link';
import {formatArea, formatCurrency} from '@decor/shared';
import {Shell} from '@/components/Shell';
import {Pill, Stat, ErrorBox} from '@/components/bits';
import {api} from '@/lib/api';
import {useApi} from '@/lib/useApi';

export default function DashboardPage() {
  const {data, error, loading, reload} = useApi(() => api.dashboard());
  const board = useApi(() => api.machineBoard());

  return (
    <Shell>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Where the shop stands right now.</p>
      <ErrorBox message={error} />

      {loading || !data ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="grid cols-4">
            <Stat label="Open orders" value={data.orders.open} />
            <Stat
              label="Overdue orders"
              value={data.orders.overdue}
              tone={data.orders.overdue > 0 ? 'danger' : undefined}
            />
            <Stat label="Jobs running" value={data.jobs.RUNNING ?? 0} />
            <Stat label="Completed today" value={data.jobsCompletedToday} tone="success" />
          </div>

          <div className="grid cols-4" style={{marginTop: 14}}>
            <Stat label="Waste this month" value={formatArea(data.wasteThisMonth.areaSqm)} tone="warning" />
            <Stat label="Waste cost" value={formatCurrency(data.wasteThisMonth.cost)} tone="warning" />
            <Stat label="Offcuts in store" value={`${data.offcutStock.pieces} pcs`} tone="success" />
            <Stat label="Offcut value held" value={formatCurrency(data.offcutStock.value)} tone="success" />
          </div>

          <div className="card" style={{marginTop: 14}}>
            <h3>Machine board</h3>
            {board.data?.length ? (
              <div className="grid cols-4">
                {board.data.map(machine => (
                  <div key={machine.id} className="card">
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <strong>{machine.code}</strong>
                      <Pill status={machine.status} />
                    </div>
                    <div className="muted" style={{fontSize: 12, marginTop: 4}}>{machine.name}</div>
                    <div style={{marginTop: 8}}>
                      {machine.currentJob ? (
                        <Link href={`/production`}>{machine.currentJob.code}</Link>
                      ) : (
                        <span className="muted">Idle</span>
                      )}
                    </div>
                    <div className="muted" style={{fontSize: 12}}>
                      {machine.queueLength} queued
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No machines configured.</p>
            )}
          </div>

          <button style={{marginTop: 14}} onClick={reload}>Refresh</button>
        </>
      )}
    </Shell>
  );
}

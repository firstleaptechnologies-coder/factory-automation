'use client';

import {formatDuration} from '@decor/shared';
import {Shell} from '@/components/Shell';
import {Bar, ErrorBox} from '@/components/bits';
import {api} from '@/lib/api';
import {useApi} from '@/lib/useApi';

export default function ReportsPage() {
  const utilization = useApi(() => api.machineUtilization());
  const materialYield = useApi(() => api.materialYield());

  return (
    <Shell>
      <h1 className="page-title">Reports</h1>
      <p className="page-sub">Last 30 days.</p>

      <ErrorBox message={utilization.error ?? materialYield.error} />

      <div className="card">
        <h3>Machine utilisation</h3>
        {utilization.data?.length ? (
          <table>
            <thead>
              <tr>
                <th>Machine</th>
                <th style={{width: 180}}>Utilisation</th>
                <th className="num">Running</th>
                <th className="num">Setup</th>
                <th className="num">Idle</th>
                <th className="num">Down</th>
                <th>Top downtime reason</th>
              </tr>
            </thead>
            <tbody>
              {utilization.data.map(row => {
                const topReason = Object.entries(row.downtimeByReason).sort(
                  (a, b) => b[1] - a[1],
                )[0];
                return (
                  <tr key={row.machineId}>
                    <td><strong>{row.code}</strong> <span className="muted">{row.name}</span></td>
                    <td>
                      <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                        <span style={{width: 44}}>{row.utilizationPct}%</span>
                        <div style={{flex: 1}}>
                          <Bar
                            pct={row.utilizationPct}
                            tone={row.utilizationPct >= 60 ? 'var(--success)' : 'var(--warning)'}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="num">{formatDuration(row.runningMinutes)}</td>
                    <td className="num">{formatDuration(row.setupMinutes)}</td>
                    <td className="num">{formatDuration(row.idleMinutes)}</td>
                    <td className="num">{formatDuration(row.downMinutes)}</td>
                    <td className="muted">
                      {topReason ? `${topReason[0]} (${formatDuration(topReason[1])})` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted">No run-log data in this window yet.</p>
        )}
      </div>

      <div className="card" style={{marginTop: 14}}>
        <h3>Material yield</h3>
        <p className="muted" style={{fontSize: 12, marginTop: -8}}>
          Issued area against area that became parts. Effective yield credits offcuts
          that went back into stock.
        </p>
        {(materialYield.data as any[])?.length ? (
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th className="num">Issued</th>
                <th className="num">Parts</th>
                <th className="num">Yield</th>
                <th className="num">Effective</th>
              </tr>
            </thead>
            <tbody>
              {(materialYield.data as any[]).map(row => (
                <tr key={row.materialId}>
                  <td>{row.name}</td>
                  <td className="num">{row.issuedSqm} m²</td>
                  <td className="num">{row.partsSqm} m²</td>
                  <td className="num">{row.yieldPct}%</td>
                  <td className="num" style={{color: 'var(--success)'}}>{row.effectiveYieldPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No material issued in this window yet.</p>
        )}
      </div>
    </Shell>
  );
}

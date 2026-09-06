'use client';

import {formatArea, formatCurrency} from '@decor/shared';
import {Shell} from '@/components/Shell';
import {Bar, Stat, ErrorBox} from '@/components/bits';
import {api} from '@/lib/api';
import {useApi} from '@/lib/useApi';

export default function WastePage() {
  const analytics = useApi(() => api.wasteAnalytics());
  const offcuts = useApi(() => api.offcutInventory());

  const data = analytics.data;

  return (
    <Shell>
      <h1 className="page-title">Waste</h1>
      <p className="page-sub">
        What was bought, what became product, and what the gap cost.
      </p>

      <ErrorBox message={analytics.error ?? offcuts.error} />

      {!data ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="grid cols-4">
            <Stat label="Waste records" value={data.totals.records} />
            <Stat label="Total area" value={formatArea(data.totals.areaSqm)} tone="warning" />
            <Stat label="Cost impact" value={formatCurrency(data.totals.costImpact)} tone="danger" />
            <Stat
              label="Offcut recovery rate"
              value={`${data.totals.recoveryRatePct}%`}
              tone="success"
            />
          </div>

          <div className="grid cols-2" style={{marginTop: 14}}>
            <div className="card">
              <h3>By type</h3>
              <table>
                <thead>
                  <tr><th>Type</th><th className="num">Records</th><th className="num">Area</th><th className="num">Cost</th></tr>
                </thead>
                <tbody>
                  {data.byType.map(row => (
                    <tr key={row.type}>
                      <td>{row.type.replace(/_/g, ' ')}</td>
                      <td className="num">{row.records}</td>
                      <td className="num">{formatArea(row.areaSqm)}</td>
                      <td className="num">{formatCurrency(row.costImpact)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h3>Worst materials by cost</h3>
              <table>
                <thead>
                  <tr><th>Material</th><th className="num">Area</th><th className="num">Cost</th></tr>
                </thead>
                <tbody>
                  {data.byMaterial.slice(0, 8).map(row => (
                    <tr key={row.materialId}>
                      <td>{row.name} <span className="muted">{row.category}</span></td>
                      <td className="num">{formatArea(row.areaSqm)}</td>
                      <td className="num">{formatCurrency(row.costImpact)}</td>
                    </tr>
                  ))}
                  {data.byMaterial.length === 0 ? (
                    <tr><td colSpan={3} className="muted">No waste recorded yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{marginTop: 14}}>
            <h3>Offcut stock — material already paid for, sitting on a rack</h3>
            <table>
              <thead>
                <tr><th>Material</th><th className="num">Pieces</th><th className="num">Area</th><th className="num">Value</th></tr>
              </thead>
              <tbody>
                {offcuts.data?.map(row => (
                  <tr key={row.materialId}>
                    <td>{row.name} <span className="muted">{row.code}</span></td>
                    <td className="num">{row.pieces}</td>
                    <td className="num">{formatArea(row.areaSqm)}</td>
                    <td className="num">{formatCurrency(row.value)}</td>
                  </tr>
                ))}
                {offcuts.data?.length === 0 ? (
                  <tr><td colSpan={4} className="muted">No offcuts in store.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="card" style={{marginTop: 14}}>
            <h3>Disposition</h3>
            {data.byDisposition.map(row => {
              const share = data.totals.areaSqm > 0 ? (row.areaSqm / data.totals.areaSqm) * 100 : 0;
              return (
                <div key={row.disposition} style={{marginBottom: 10}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 13}}>
                    <span>{row.disposition}</span>
                    <span className="muted">{formatArea(row.areaSqm)} · {share.toFixed(1)}%</span>
                  </div>
                  <Bar
                    pct={share}
                    tone={row.disposition === 'REUSE' ? 'var(--success)' : 'var(--warning)'}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </Shell>
  );
}

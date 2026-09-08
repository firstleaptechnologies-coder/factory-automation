'use client';

import { useState } from 'react';
import type { WasteReport } from '@decor/shared';
import { monthBounds, shiftMonth, thisMonth } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Shell } from '@/components/Shell';
import { Button, Card, EmptyState, Field, Loader, PageHead } from '@/ui';

export default function WastePage() {
  return (
    <Shell>
      <Waste />
    </Shell>
  );
}

/**
 * What became of the material that left the rack.
 *
 * The number the owner cannot see today. Waste is measured against what was
 * *issued*, not against what was bought — a shop that buys a hundred sheets
 * and cuts ten has wasted a share of ten, and dividing by a hundred would make
 * every month look better the more it ordered.
 */
function Waste() {
  const [month, setMonth] = useState(thisMonth());
  const report = useApi<WasteReport>(() => api.wasteReport(monthBounds(month)), [month]);
  const data = report.data;

  return (
    <>
      <PageHead
        title="Waste"
        subtitle="Of what was cut, not of what was bought"
        action={
          <div className="row">
            <Button
              title="Previous"
              variant="dark"
              onClick={() => setMonth(shiftMonth(month, -1))}
            />
            <div style={{ minWidth: 150 }}>
              <Field
                label="Month"
                type="month"
                value={month}
                onChange={setMonth}
                style={{ marginBottom: 0 }}
              />
            </div>
            <Button title="Next" variant="dark" onClick={() => setMonth(shiftMonth(month, 1))} />
          </div>
        }
      />

      <Card tone="accent" className="enter">
        <span className="t-label on-accent" style={{ opacity: 0.75 }}>
          {data?.totals.wastePct ?? 0}% of what was issued
        </span>
        <div className="t-display on-accent">{data?.totals.wasted ?? 0}</div>
        <div className="t-small on-accent" style={{ opacity: 0.8, marginTop: 4 }}>
          {data?.totals.consumed ?? 0} issued, {data?.totals.offcut ?? 0} back as offcut
        </div>
      </Card>

      <div style={{ height: 'var(--s-lg)' }} />

      {report.loading ? (
        <Loader />
      ) : (data?.rows ?? []).length === 0 ? (
        <EmptyState title="Nothing was cut this month" />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Material</th>
                <th className="num">Issued</th>
                <th className="num">Offcut back</th>
                <th className="num">Wasted</th>
                <th className="num">Share</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((row) => (
                <tr key={row.material.id}>
                  <td className="bold">{row.material.name}</td>
                  <td className="num muted">{row.consumed}</td>
                  <td className="num muted">{row.offcut}</td>
                  <td className="num bold">{row.wasted}</td>
                  <td className="num">{row.wastePct}%</td>
                  <td style={{ minWidth: 120 }}>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${Math.min(100, Math.max(2, row.wastePct))}%`,
                          background: 'var(--danger)',
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

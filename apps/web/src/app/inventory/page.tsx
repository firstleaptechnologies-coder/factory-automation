'use client';

import {useState} from 'react';
import {formatArea, formatSheetSize} from '@decor/shared';
import {Shell} from '@/components/Shell';
import {Pill, ErrorBox} from '@/components/bits';
import {api} from '@/lib/api';
import {useApi} from '@/lib/useApi';

type Tab = 'summary' | 'sheets' | 'offcuts';

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>('summary');
  const summary = useApi(() => api.stockSummary());
  const units = useApi(
    () => api.stock({offcutsOnly: tab === 'offcuts' ? true : undefined, limit: 100}),
    [tab],
  );

  return (
    <Shell>
      <h1 className="page-title">Inventory</h1>
      <p className="page-sub">
        Every sheet and slab is tracked individually, so an offcut still points back
        at the sheet it came from.
      </p>

      <div style={{display: 'flex', gap: 8, marginBottom: 14}}>
        {(['summary', 'sheets', 'offcuts'] as Tab[]).map(value => (
          <button
            key={value}
            className={tab === value ? 'primary' : ''}
            onClick={() => setTab(value)}>
            {value === 'summary' ? 'Stock on hand' : value === 'sheets' ? 'All pieces' : 'Offcuts'}
          </button>
        ))}
      </div>

      <ErrorBox message={summary.error ?? units.error} />

      <div className="card scroll-x">
        {tab === 'summary' ? (
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>Category</th>
                <th>Kind</th>
                <th className="num">Pieces</th>
                <th className="num">Area</th>
                <th>Flag</th>
              </tr>
            </thead>
            <tbody>
              {summary.data?.map(row => (
                <tr key={`${row.materialId}-${row.kind}`}>
                  <td><strong>{row.materialName}</strong> <span className="muted">{row.materialCode}</span></td>
                  <td>{row.category}</td>
                  <td>{row.kind.replace(/_/g, ' ')}</td>
                  <td className="num">{row.pieces}</td>
                  <td className="num">{row.areaSqm ? formatArea(row.areaSqm) : row.quantity}</td>
                  <td>
                    {row.belowReorderLevel ? (
                      <span className="pill" style={{background: 'var(--warning)'}}>REORDER</span>
                    ) : null}
                  </td>
                </tr>
              ))}
              {summary.data?.length === 0 ? (
                <tr><td colSpan={6} className="muted">No stock on hand.</td></tr>
              ) : null}
            </tbody>
          </table>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Material</th>
                <th>Size</th>
                <th className="num">Area</th>
                <th>Location</th>
                <th>Kind</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {units.data?.data.map(unit => (
                <tr key={unit.id}>
                  <td><strong>{unit.code}</strong></td>
                  <td>{unit.material?.name}</td>
                  <td>{formatSheetSize(unit.lengthMm, unit.widthMm)}</td>
                  <td className="num">{unit.areaSqm ? formatArea(unit.areaSqm) : '—'}</td>
                  <td>{unit.location?.name ?? '—'}</td>
                  <td>{unit.kind.replace(/_/g, ' ')}</td>
                  <td><Pill status={unit.status} /></td>
                </tr>
              ))}
              {units.data?.data.length === 0 ? (
                <tr><td colSpan={7} className="muted">Nothing here yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}

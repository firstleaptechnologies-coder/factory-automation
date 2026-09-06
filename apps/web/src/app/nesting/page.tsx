'use client';

import {useMemo, useState} from 'react';
import type {NestPreview} from '@decor/shared';
import {formatArea, formatCurrency} from '@decor/shared';
import {Shell} from '@/components/Shell';
import {Bar, ErrorBox} from '@/components/bits';
import {api} from '@/lib/api';
import {useApi} from '@/lib/useApi';

interface PartRow {
  label: string;
  lengthMm: string;
  widthMm: string;
  quantity: string;
}

const BLANK: PartRow = {label: '', lengthMm: '', widthMm: '', quantity: '1'};

export default function NestingPage() {
  const materials = useApi(() => api.materials({limit: 100}));
  const [materialId, setMaterialId] = useState('');
  const [kerfMm, setKerfMm] = useState('');
  const [parts, setParts] = useState<PartRow[]>([
    {label: 'Panel A', lengthMm: '600', widthMm: '400', quantity: '12'},
    {...BLANK},
  ]);
  const [result, setResult] = useState<NestPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedMaterial = useMemo(
    () => materials.data?.data.find(m => m.id === materialId),
    [materials.data, materialId],
  );

  const update = (index: number, field: keyof PartRow, value: string) =>
    setParts(rows => rows.map((row, i) => (i === index ? {...row, [field]: value} : row)));

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = parts
        .filter(p => p.label && Number(p.lengthMm) > 0 && Number(p.widthMm) > 0)
        .map(p => ({
          label: p.label,
          lengthMm: Number(p.lengthMm),
          widthMm: Number(p.widthMm),
          quantity: Number(p.quantity || 1),
        }));

      if (!materialId || payload.length === 0) {
        setError('Pick a material and add at least one part.');
        return;
      }

      setResult(
        await api.previewNest({
          materialId,
          kerfMm: kerfMm ? Number(kerfMm) : undefined,
          parts: payload,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nesting failed');
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <h1 className="page-title">Nesting</h1>
      <p className="page-sub">
        Lay parts on a sheet before cutting, and see what the offcuts and the waste
        will actually be.
      </p>

      <div className="grid cols-2">
        <div className="card">
          <h3>Input</h3>

          <div className="row">
            <div className="field" style={{flex: 2}}>
              <label htmlFor="material">Material</label>
              <select id="material" value={materialId} onChange={e => setMaterialId(e.target.value)}>
                <option value="">Select…</option>
                {materials.data?.data.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{flex: 1}}>
              <label htmlFor="kerf">Kerf mm</label>
              <input
                id="kerf"
                placeholder={selectedMaterial?.defaultKerfMm ?? 'default'}
                value={kerfMm}
                onChange={e => setKerfMm(e.target.value)}
              />
            </div>
          </div>

          {selectedMaterial ? (
            <p className="muted" style={{fontSize: 12, marginTop: -4}}>
              Sheet {Math.round(Number(selectedMaterial.lengthMm ?? 0))} ×{' '}
              {Math.round(Number(selectedMaterial.widthMm ?? 0))} mm
              {selectedMaterial.hasGrain ? ' · grain fixed, parts will not be rotated' : ''}
            </p>
          ) : null}

          <table style={{marginTop: 12}}>
            <thead>
              <tr>
                <th>Part</th>
                <th style={{width: 90}}>Length</th>
                <th style={{width: 90}}>Width</th>
                <th style={{width: 70}}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((part, index) => (
                <tr key={index}>
                  <td>
                    <input
                      value={part.label}
                      placeholder="Label"
                      onChange={e => update(index, 'label', e.target.value)}
                    />
                  </td>
                  <td><input value={part.lengthMm} onChange={e => update(index, 'lengthMm', e.target.value)} /></td>
                  <td><input value={part.widthMm} onChange={e => update(index, 'widthMm', e.target.value)} /></td>
                  <td><input value={part.quantity} onChange={e => update(index, 'quantity', e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{display: 'flex', gap: 8, marginTop: 12}}>
            <button onClick={() => setParts(rows => [...rows, {...BLANK}])}>+ Add part</button>
            <button className="primary" onClick={run} disabled={busy}>
              {busy ? 'Nesting…' : 'Run nest'}
            </button>
          </div>

          <ErrorBox message={error} />
        </div>

        <div className="card">
          <h3>Result</h3>
          {!result ? (
            <p className="muted">Run a nest to see the layout and the yield.</p>
          ) : (
            <>
              <div className="grid cols-2" style={{marginBottom: 12}}>
                <div>
                  <div className="stat-value">{result.utilizationPct}%</div>
                  <div className="stat-label">Sheet used by parts</div>
                  <Bar pct={result.utilizationPct} tone="var(--success)" />
                </div>
                <div>
                  <div className="stat-value success">{result.effectiveUtilizationPct}%</div>
                  <div className="stat-label">Including reusable offcuts</div>
                  <Bar pct={result.effectiveUtilizationPct} tone="var(--primary)" />
                </div>
              </div>

              <table>
                <tbody>
                  <tr><td>Sheets needed</td><td className="num"><strong>{result.sheetsUsed}</strong></td></tr>
                  <tr><td>Parts area</td><td className="num">{formatArea(result.partsAreaSqm)}</td></tr>
                  <tr><td>Reusable offcuts</td><td className="num">{formatArea(result.offcutAreaSqm)} ({result.recoverableOffcuts.length} pcs)</td></tr>
                  <tr><td>Lost to kerf &amp; trim</td><td className="num" style={{color: 'var(--warning)'}}>{formatArea(result.wasteAreaSqm)}</td></tr>
                  <tr><td>Cost of that loss</td><td className="num" style={{color: 'var(--warning)'}}>{formatCurrency(result.wasteCost)}</td></tr>
                </tbody>
              </table>

              {result.unplaced.length > 0 ? (
                <p className="error" style={{marginTop: 10}}>
                  Did not fit: {result.unplaced.map(u => `${u.label} ×${u.quantity}`).join(', ')}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {result ? <SheetLayout preview={result} /> : null}
    </Shell>
  );
}

/** Scale drawing of each sheet: parts in blue, reusable offcuts outlined green. */
function SheetLayout({preview}: {preview: NestPreview}) {
  const {sheetLengthMm, sheetWidthMm, sheetsUsed, placements, recoverableOffcuts} = preview;

  return (
    <div className="card" style={{marginTop: 14}}>
      <h3>Sheet layout</h3>
      <div style={{display: 'flex', flexWrap: 'wrap', gap: 20}}>
        {Array.from({length: sheetsUsed}, (_, sheetIndex) => (
          <div key={sheetIndex}>
            <div className="muted" style={{fontSize: 12, marginBottom: 4}}>
              Sheet {sheetIndex + 1} · {Math.round(sheetLengthMm)} × {Math.round(sheetWidthMm)} mm
            </div>
            <svg
              viewBox={`0 0 ${sheetLengthMm} ${sheetWidthMm}`}
              width={Math.min(520, sheetLengthMm / 5)}
              style={{
                border: '1px solid var(--border)',
                background: 'var(--surface-alt)',
                borderRadius: 6,
              }}>
              {/* Nest coordinates start at the bottom-left of the bed, SVG at the
                  top-left. Flip the drawing so it matches what the operator sees
                  standing at the machine. */}
              <g transform={`translate(0, ${sheetWidthMm}) scale(1, -1)`}>
              {recoverableOffcuts
                .filter(o => o.sheetIndex === sheetIndex)
                .map((offcut, i) => (
                  <rect
                    key={`offcut-${i}`}
                    x={offcut.xMm}
                    y={offcut.yMm}
                    width={offcut.lengthMm}
                    height={offcut.widthMm}
                    fill="var(--success)"
                    fillOpacity={0.1}
                    stroke="var(--success)"
                    strokeDasharray="20 12"
                    strokeWidth={3}
                  />
                ))}
              {placements
                .filter(p => p.sheetIndex === sheetIndex)
                .map((part, i) => (
                  <g key={i}>
                    <rect
                      x={part.xMm}
                      y={part.yMm}
                      width={part.lengthMm}
                      height={part.widthMm}
                      fill="var(--primary)"
                      fillOpacity={0.28}
                      stroke="var(--primary)"
                      strokeWidth={3}
                    />
                    <text
                      transform={`translate(${part.xMm + part.lengthMm / 2}, ${
                        part.yMm + part.widthMm / 2
                      }) scale(1, -1)`}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="var(--text)"
                      fontSize={Math.min(part.lengthMm, part.widthMm) / 5}>
                      {part.label}
                    </text>
                  </g>
                ))}
              </g>
            </svg>
          </div>
        ))}
      </div>
      <p className="muted" style={{fontSize: 12, marginTop: 8}}>
        Positions include kerf allowance, measured from the bottom-left corner of the sheet.
      </p>
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { Material } from '@decor/shared';
import { LENGTH_UNITS, LengthUnit, UNIT_LABEL, parseLengthToMm } from '@decor/shared';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';

export default function MaterialsAdminPage() {
  const { data, error, loading, reload } = useApi<Material[]>(() => api.materials(true));
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [thicknessInput, setThicknessInput] = useState<Record<string, string>>({});
  const [thicknessUnit, setThicknessUnit] = useState<LengthUnit>('MM');
  const [message, setMessage] = useState<string | null>(null);

  const act = async (run: () => Promise<unknown>) => {
    setMessage(null);
    try {
      await run();
      reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed');
    }
  };

  return (
    <Shell>
      <div className="legacy">
      <h1 className="page-title">Materials</h1>
      <p className="page-sub">
        What can be picked while punching, and the thickness options for each.
      </p>

      {message ? <div className="banner danger">{message}</div> : null}
      {error ? <div className="banner danger">{error}</div> : null}

      <div className="card">
        <h3>Add a material</h3>
        <div className="field-row">
          <div className="col" style={{ flexBasis: 140 }}>
            <label htmlFor="code">Code</label>
            <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </div>
          <div className="col" style={{ flexBasis: 240 }}>
            <label htmlFor="name">Name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button
            className="primary row-action"
            disabled={!code || !name}
            onClick={() =>
              act(async () => {
                await api.createMaterial({ code, name });
                setCode('');
                setName('');
              })
            }>
            Add
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Configured materials</h3>
          <div className="spacer" />
          <span className="muted" style={{ fontSize: 12 }}>Enter thickness in</span>
          <div className="unit-toggle">
            {LENGTH_UNITS.filter((u) => u === 'MM' || u === 'IN').map((u) => (
              <button
                key={u}
                className={thicknessUnit === u ? 'active' : ''}
                onClick={() => setThicknessUnit(u)}>
                {UNIT_LABEL[u]}
              </button>
            ))}
          </div>
        </div>

        {loading ? <p className="muted">Loading…</p> : null}

        <table className="table">
          <thead>
            <tr><th>Material</th><th>Thicknesses (stored in mm)</th><th style={{ width: 260 }}>Add thickness</th></tr>
          </thead>
          <tbody>
            {data?.map((material) => (
              <tr key={material.id} style={{ opacity: material.isActive ? 1 : 0.5 }}>
                <td>
                  <span className="pill" style={{ background: material.color ?? 'var(--text-muted)' }}>
                    {material.code}
                  </span>{' '}
                  <strong>{material.name}</strong>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {material.thicknesses.length === 0 ? (
                      <span className="muted">None</span>
                    ) : (
                      material.thicknesses.map((t) => (
                        <button
                          key={t.id}
                          title="Remove"
                          onClick={() => act(() => api.removeThickness(t.id))}
                          style={{ padding: '4px 10px', fontSize: 12 }}>
                          {t.label ?? `${Number(t.valueMm)} mm`} ×
                        </button>
                      ))
                    )}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      placeholder={thicknessUnit === 'MM' ? '18' : '3/4'}
                      value={thicknessInput[material.id] ?? ''}
                      onChange={(e) =>
                        setThicknessInput({ ...thicknessInput, [material.id]: e.target.value })
                      }
                    />
                    <button
                      onClick={() =>
                        act(async () => {
                          const raw = thicknessInput[material.id] ?? '';
                          const mm = parseLengthToMm(raw, thicknessUnit);
                          if (mm === null) throw new Error(`Could not read "${raw}" as a thickness`);
                          await api.addThickness(material.id, {
                            value: { value: mm, unit: 'MM' },
                            label: thicknessUnit === 'IN' ? `${raw} in` : undefined,
                          });
                          setThicknessInput({ ...thicknessInput, [material.id]: '' });
                        })
                      }>
                      Add
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </Shell>
  );
}

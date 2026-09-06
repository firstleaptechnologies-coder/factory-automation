'use client';

import { useState } from 'react';
import type { SizePreset } from '@decor/shared';
import { LENGTH_UNITS, LengthUnit, UNIT_LABEL, formatLength, parseLengthToMm } from '@decor/shared';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';

export default function SizesAdminPage() {
  const { data, error, loading, reload } = useApi<SizePreset[]>(() => api.sizePresets(true));
  const [unit, setUnit] = useState<LengthUnit>('FT');
  const [form, setForm] = useState({ code: '', name: '', length: '', width: '', thickness: '' });
  const [message, setMessage] = useState<string | null>(null);

  const create = async () => {
    setMessage(null);
    const lengthMm = parseLengthToMm(form.length, unit);
    const widthMm = parseLengthToMm(form.width, unit);
    if (lengthMm === null || widthMm === null) {
      setMessage('Length and width must be readable sizes.');
      return;
    }
    const thicknessMm = form.thickness ? parseLengthToMm(form.thickness, 'MM') : null;

    try {
      await api.createSizePreset({
        code: form.code,
        name: form.name,
        length: { value: lengthMm, unit: 'MM' },
        width: { value: widthMm, unit: 'MM' },
        thickness: thicknessMm !== null ? { value: thicknessMm, unit: 'MM' } : undefined,
      });
      setForm({ code: '', name: '', length: '', width: '', thickness: '' });
      reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save the preset');
    }
  };

  return (
    <Shell>
      <h1 className="page-title">Sizes</h1>
      <p className="page-sub">
        Presets offered while punching. Type in any unit — everything is stored in millimetres.
      </p>

      {message ? <div className="banner danger">{message}</div> : null}
      {error ? <div className="banner danger">{error}</div> : null}

      <div className="card">
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Add a size</h3>
          <div className="spacer" />
          <div className="unit-toggle">
            {LENGTH_UNITS.map((u) => (
              <button key={u} className={unit === u ? 'active' : ''} onClick={() => setUnit(u)}>
                {UNIT_LABEL[u]}
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <div style={{ width: 150 }}>
            <label>Code</label>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          </div>
          <div style={{ width: 220 }}>
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div style={{ width: 120 }}>
            <label>Length ({UNIT_LABEL[unit]})</label>
            <input value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value })} />
          </div>
          <div style={{ width: 120 }}>
            <label>Width ({UNIT_LABEL[unit]})</label>
            <input value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} />
          </div>
          <div style={{ width: 130 }}>
            <label>Thickness (mm)</label>
            <input value={form.thickness} onChange={(e) => setForm({ ...form, thickness: e.target.value })} />
          </div>
          <button className="primary" disabled={!form.code || !form.name} onClick={create}>Add</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Configured sizes</h3>
          <div className="spacer" />
          <span className="muted" style={{ fontSize: 12 }}>shown in {UNIT_LABEL[unit]}</span>
        </div>
        {loading ? <p className="muted">Loading…</p> : null}
        <table>
          <thead>
            <tr><th>Code</th><th>Name</th><th>Length</th><th>Width</th><th>Thickness</th><th>Stored</th></tr>
          </thead>
          <tbody>
            {data?.map((preset) => (
              <tr key={preset.id} style={{ opacity: preset.isActive ? 1 : 0.5 }}>
                <td className="muted">{preset.code}</td>
                <td><strong>{preset.name}</strong></td>
                <td>{formatLength(preset.lengthMm, unit)}</td>
                <td>{formatLength(preset.widthMm, unit)}</td>
                <td>{preset.thicknessMm ? formatLength(preset.thicknessMm, 'MM') : '—'}</td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {Number(preset.lengthMm)} × {Number(preset.widthMm)} mm
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

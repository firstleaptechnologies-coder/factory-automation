'use client';

import { useState } from 'react';
import type { Lead, LengthUnit, Material, Order, PunchItemInput } from '@fas/shared';
import { LENGTH_UNITS, UNIT_LABEL, parseLengthToMm } from '@fas/shared';
import { api } from '@/lib/api';
import { useDisplayUnit } from '@/lib/useUnit';
import { Select } from '@/ui';

interface ItemDraft {
  key: string;
  length: string;
  width: string;
  materialId: string;
  materialThicknessId: string;
  quantity: string;
}

const blank = (): ItemDraft => ({
  key: Math.random().toString(36).slice(2),
  length: '',
  width: '',
  materialId: '',
  materialThicknessId: '',
  quantity: '1',
});

/**
 * Converting a lead into an order.
 *
 * A lead records an enquiry, not dimensions, so the sizes are collected here —
 * this is the point where a conversation becomes something the shop can cut.
 * The client is carried over automatically: an existing one is reused, and a
 * lead that only had a name and phone becomes a real client now.
 */
export function ConvertLeadDialog({
  lead,
  materials,
  onClose,
  onConverted,
}: {
  lead: Lead;
  materials: Material[];
  onClose: () => void;
  onConverted: (order: Order) => void | Promise<void>;
}) {
  const [location, setLocation] = useState(lead.location ?? '');
  // Whatever this person works in, remembered under Settings.
  const [unit, setUnit] = useDisplayUnit();
  const [items, setItems] = useState<ItemDraft[]>([blank()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = (key: string, changes: Partial<ItemDraft>) =>
    setItems((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));

  const submit = async () => {
    setError(null);

    if (!location.trim()) {
      setError('Location is required.');
      return;
    }

    const payload: PunchItemInput[] = [];
    for (const item of items) {
      const lengthMm = parseLengthToMm(item.length, unit);
      const widthMm = parseLengthToMm(item.width, unit);
      if (lengthMm === null || widthMm === null) {
        setError('Every item needs a readable length and width.');
        return;
      }
      if (!item.materialId) {
        setError('Every item needs a material.');
        return;
      }
      payload.push({
        length: { value: lengthMm, unit: 'MM' },
        width: { value: widthMm, unit: 'MM' },
        materialId: item.materialId,
        materialThicknessId: item.materialThicknessId || undefined,
        quantity: Number(item.quantity || 1),
      });
    }

    setBusy(true);
    try {
      const result = await api.convertLead(lead.id, { location: location.trim(), items: payload });
      await onConverted(result.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not convert the lead');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h3>Convert {lead.code}</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>
          {lead.title} — {lead.client?.name ?? lead.contactName ?? lead.company}
          {lead.client ? ' (existing client)' : ' (a client will be created)'}
        </p>

        {error ? <div className="banner danger">{error}</div> : null}

        <div className="field">
          <label htmlFor="convert-location">Location</label>
          <input
            id="convert-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Site or address"
          />
        </div>

        <div className="toolbar">
          <strong style={{ fontSize: 13 }}>Items</strong>
          <div className="spacer" />
          <div className="unit-toggle">
            {LENGTH_UNITS.map((u) => (
              <button key={u} className={unit === u ? 'active' : ''} onClick={() => setUnit(u)}>
                {UNIT_LABEL[u]}
              </button>
            ))}
          </div>
        </div>

        {items.map((item, index) => {
          const material = materials.find((m) => m.id === item.materialId);
          return (
            <div className="item-card" key={item.key}>
              <div className="item-head">
                <span className="line-no">LINE {index + 1}</span>
                {items.length > 1 ? (
                  <button onClick={() => setItems((rows) => rows.filter((r) => r.key !== item.key))}>
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Length ({UNIT_LABEL[unit]})</label>
                  <input
                    value={item.length}
                    placeholder={`8 or 8' 6"`}
                    onChange={(e) => patch(item.key, { length: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Width ({UNIT_LABEL[unit]})</label>
                  <input
                    value={item.width}
                    onChange={(e) => patch(item.key, { width: e.target.value })}
                  />
                </div>
                <Select
                  label="Material"
                  value={item.materialId}
                  placeholder="Select…"
                  onChange={(value) =>
                    patch(item.key, { materialId: value, materialThicknessId: '' })
                  }
                  options={materials.map((m) => ({
                    value: m.id,
                    label: m.name,
                    color: m.color,
                  }))}
                />
                <Select
                  label="Thickness"
                  value={item.materialThicknessId}
                  disabled={!material}
                  placeholder="—"
                  onChange={(value) => patch(item.key, { materialThicknessId: value })}
                  options={[
                    { value: '', label: '—' },
                    ...(material?.thicknesses ?? []).map((t) => ({
                      value: t.id,
                      label: t.label ?? `${Number(t.valueMm)} mm`,
                    })),
                  ]}
                />
                <div className="field">
                  <label>Qty</label>
                  <input
                    value={item.quantity}
                    inputMode="numeric"
                    onChange={(e) => patch(item.key, { quantity: e.target.value })}
                  />
                </div>
              </div>
            </div>
          );
        })}

        <div className="button-row">
          <button onClick={() => setItems((rows) => [...rows, blank()])}>+ Add item</button>
          <div className="spacer" />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={submit} disabled={busy}>
            {busy ? 'Converting…' : 'Convert to order'}
          </button>
        </div>
      </div>
    </div>
  );
}

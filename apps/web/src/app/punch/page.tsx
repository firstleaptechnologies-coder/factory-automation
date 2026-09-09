'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Material, PunchItemInput, SizePreset } from '@fas/shared';
import { DEFAULT_UNIT, LengthUnit, parseLengthToMm } from '@fas/shared';
import { Shell } from '@/components/Shell';
import { Select } from '@/ui';
import { ClientPicker, ClientSelection } from '@/components/ClientPicker';
import { PhotoField, PendingPhoto } from '@/components/PhotoField';
import { SizeInput } from '@/components/SizeInput';
import { api } from '@/lib/api';

interface ItemDraft {
  key: string;
  sizePresetId: string;
  length: string;
  width: string;
  unit: LengthUnit;
  materialId: string;
  materialThicknessId: string;
  customThickness: string;
  quantity: string;
  notes: string;
}

const blankItem = (unit: LengthUnit): ItemDraft => ({
  key: Math.random().toString(36).slice(2),
  sizePresetId: '',
  length: '',
  width: '',
  unit,
  materialId: '',
  materialThicknessId: '',
  customThickness: '',
  quantity: '1',
  notes: '',
});

export default function PunchPage() {
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [presets, setPresets] = useState<SizePreset[]>([]);

  const [client, setClient] = useState<ClientSelection | null>(null);
  const [location, setLocation] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [unit, setUnit] = useState<LengthUnit>(DEFAULT_UNIT);
  const [items, setItems] = useState<ItemDraft[]>([blankItem(DEFAULT_UNIT)]);

  const [referencePhotos, setReferencePhotos] = useState<PendingPhoto[]>([]);
  const [referenceDescription, setReferenceDescription] = useState('');
  const [sizePhotos, setSizePhotos] = useState<PendingPhoto[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.materials(), api.sizePresets()])
      .then(([m, p]) => { setMaterials(m); setPresets(p); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load configuration'));
  }, []);

  const knownLocations = useMemo(
    () => client?.client?.locations?.map((l) => l.name) ?? [],
    [client],
  );

  const patch = (key: string, changes: Partial<ItemDraft>) =>
    setItems((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));

  const applyPreset = (key: string, presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) {
      patch(key, { sizePresetId: '' });
      return;
    }
    // Show the preset's stored millimetres back in the row's unit, so the
    // numbers the user sees are the ones that will be saved.
    const factor = { MM: 1, CM: 10, M: 1000, IN: 25.4, FT: 304.8 }[
      items.find((i) => i.key === key)?.unit ?? unit
    ];
    patch(key, {
      sizePresetId: presetId,
      length: String(Number((Number(preset.lengthMm) / factor).toFixed(3))),
      width: String(Number((Number(preset.widthMm) / factor).toFixed(3))),
    });
  };

  const submit = async () => {
    setError(null);

    if (!client?.client && !client?.newClient?.name) {
      setError('Pick a client or create one.');
      return;
    }
    if (!location.trim()) {
      setError('Location is required.');
      return;
    }
    if (referencePhotos.length > 0 && !referenceDescription.trim()) {
      setError('Reference images need a description.');
      return;
    }

    const payloadItems: PunchItemInput[] = [];
    for (const item of items) {
      if (!item.materialId) {
        setError('Every item needs a material.');
        return;
      }
      const lengthMm = parseLengthToMm(item.length, item.unit);
      const widthMm = parseLengthToMm(item.width, item.unit);
      if (lengthMm === null || widthMm === null) {
        setError('Every item needs a readable length and width.');
        return;
      }

      const thicknessMm = item.customThickness
        ? parseLengthToMm(item.customThickness, 'MM')
        : null;

      payloadItems.push({
        sizePresetId: item.sizePresetId || undefined,
        // Send millimetres explicitly — the value was already resolved here, so
        // the server is not re-parsing free text.
        length: { value: lengthMm, unit: 'MM' },
        width: { value: widthMm, unit: 'MM' },
        thickness: thicknessMm !== null ? { value: thicknessMm, unit: 'MM' } : undefined,
        materialId: item.materialId,
        materialThicknessId: item.materialThicknessId || undefined,
        quantity: Number(item.quantity || 1),
        notes: item.notes || undefined,
      });
    }

    setBusy(true);
    try {
      const order = await api.punchOrder({
        clientId: client.client?.id,
        newClient: client.newClient?.name ? client.newClient : undefined,
        location: location.trim(),
        priority: priority as never,
        dueDate: dueDate || undefined,
        notes: notes || undefined,
        items: payloadItems,
      });

      if (referencePhotos.length) {
        await api.addAttachments(order.id, referencePhotos.map((p) => p.file), {
          kind: 'REFERENCE_IMAGE',
          description: referenceDescription,
        });
      }
      if (sizePhotos.length) {
        await api.addAttachments(order.id, sizePhotos.map((p) => p.file), {
          kind: 'SIZE_IMAGE',
        });
      }

      router.push(`/orders/${order.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not punch the order');
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="legacy">
      <h1 className="page-title">Punch order</h1>
      <p className="page-sub">Client, site, sizes, material, photos.</p>

      {error ? <div className="banner danger">{error}</div> : null}

      <div className="grid cols-2">
        <div className="card">
          <h3>Client &amp; site</h3>

          <ClientPicker value={client} onChange={setClient} />

          <div className="field">
            <label htmlFor="location">Location</label>
            <input
              id="location"
              list="known-locations"
              placeholder="Site or address"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <datalist id="known-locations">
              {knownLocations.map((name) => <option key={name} value={name} />)}
            </datalist>
          </div>

          <div className="field-row">
            <Select
              label="Priority"
              value={priority}
              onChange={setPriority}
              options={['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => ({
                value: p,
                label: p,
              }))}
            />
            <div className="field">
              <label htmlFor="due">Due date</label>
              <input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="notes">Notes</label>
            <input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="card">
          <h3>Photos</h3>

          <PhotoField
            label="Reference images"
            hint="What the client wants it to look like."
            purpose="REFERENCE_IMAGE"
            photos={referencePhotos}
            onChange={setReferencePhotos}
          />
          {referencePhotos.length ? (
            <div className="field">
              <label htmlFor="ref-desc">Description of the references</label>
              <input
                id="ref-desc"
                placeholder="What is the client pointing at in these?"
                value={referenceDescription}
                onChange={(e) => setReferenceDescription(e.target.value)}
              />
            </div>
          ) : null}

          <PhotoField
            label="Size image"
            hint="The measured drawing or the tape on site. Kept at higher quality so numbers stay readable."
            purpose="SIZE_IMAGE"
            photos={sizePhotos}
            onChange={setSizePhotos}
          />
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Items</h3>
          <div className="spacer" />
          <span className="muted" style={{ fontSize: 12 }}>Default unit</span>
          <div className="unit-toggle">
            {(['FT', 'IN', 'MM'] as LengthUnit[]).map((u) => (
              <button
                key={u}
                type="button"
                className={unit === u ? 'active' : ''}
                onClick={() => {
                  setUnit(u);
                  setItems((rows) => rows.map((r) => ({ ...r, unit: u })));
                }}>
                {u.toLowerCase()}
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
                  <button
                    type="button"
                    onClick={() => setItems((rows) => rows.filter((r) => r.key !== item.key))}>
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="field-row">
                <Select
                  label="Size preset"
                  value={item.sizePresetId}
                  onChange={(value) => applyPreset(item.key, value)}
                  options={[
                    { value: '', label: 'Custom size' },
                    ...presets.map((preset) => ({ value: preset.id, label: preset.name })),
                  ]}
                />

                <SizeInput
                  label="Length"
                  value={item.length}
                  unit={item.unit}
                  onChange={(value) => patch(item.key, { length: value, sizePresetId: '' })}
                  onUnitChange={(u) => patch(item.key, { unit: u })}
                />
                <SizeInput
                  label="Width"
                  value={item.width}
                  unit={item.unit}
                  onChange={(value) => patch(item.key, { width: value, sizePresetId: '' })}
                />
              </div>

              <div className="field-row">
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
                  placeholder={material ? 'Custom / none' : 'Pick a material first'}
                  onChange={(value) =>
                    patch(item.key, { materialThicknessId: value, customThickness: '' })
                  }
                  options={[
                    { value: '', label: material ? 'Custom / none' : 'Pick a material first' },
                    ...(material?.thicknesses ?? []).map((t) => ({
                      value: t.id,
                      label: t.label ?? `${Number(t.valueMm)} mm`,
                    })),
                  ]}
                />

                {!item.materialThicknessId ? (
                  <SizeInput
                    label="Custom thickness (mm)"
                    value={item.customThickness}
                    unit="MM"
                    placeholder="e.g. 18"
                    onChange={(value) => patch(item.key, { customThickness: value })}
                  />
                ) : null}

                <div className="field">
                  <label>Qty</label>
                  <input
                    value={item.quantity}
                    inputMode="numeric"
                    onChange={(e) => patch(item.key, { quantity: e.target.value })}
                  />
                </div>
              </div>

              <div className="field">
                <label>Item notes</label>
                <input
                  value={item.notes}
                  onChange={(e) => patch(item.key, { notes: e.target.value })}
                />
              </div>
            </div>
          );
        })}

        <div className="button-row">
          <button type="button" onClick={() => setItems((rows) => [...rows, blankItem(unit)])}>
            + Add item
          </button>
          <button className="primary" disabled={busy} onClick={submit}>
            {busy ? 'Punching…' : 'Punch order'}
          </button>
        </div>
      </div>
    </div>
    </Shell>
  );
}

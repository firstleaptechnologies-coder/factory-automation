'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CustomFieldDefinition, CustomFieldType, LeadSource } from '@fas/shared';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { Select } from '@/ui';

const TYPES: CustomFieldType[] = [
  'TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTI_SELECT', 'PHONE', 'EMAIL',
];

/**
 * What the shop captures on a lead, and where leads come from — both editable
 * without a deploy. The lead form is generated from these rows.
 */
export default function LeadFieldsAdminPage() {
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [message, setMessage] = useState<{ text: string; tone: 'success' | 'danger' } | null>(null);

  const [field, setField] = useState({
    label: '', key: '', type: 'TEXT' as CustomFieldType, options: '', required: false,
  });
  const [source, setSource] = useState({ code: '', name: '' });

  const load = useCallback(async () => {
    const [f, s] = await Promise.all([api.leadFields(true), api.leadSources(true)]);
    setFields(f);
    setSources(s);
  }, []);

  useEffect(() => {
    load().catch((e) =>
      setMessage({ text: e instanceof Error ? e.message : 'Could not load', tone: 'danger' }),
    );
  }, [load]);

  const act = async (run: () => Promise<unknown>, success?: string) => {
    setMessage(null);
    try {
      await run();
      await load();
      if (success) setMessage({ text: success, tone: 'success' });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Failed', tone: 'danger' });
    }
  };

  const needsOptions = field.type === 'SELECT' || field.type === 'MULTI_SELECT';

  return (
    <Shell>
      <div className="legacy">
      <h1 className="page-title">Lead fields</h1>
      <p className="page-sub">
        Add what this shop needs to capture. The lead form builds itself from these.
      </p>

      {message ? <div className={`banner ${message.tone}`}>{message.text}</div> : null}

      <div className="card">
        <h3>Add a field</h3>
        <div className="field-row">
          <div className="col" style={{ flexBasis: 220 }}>
            <label>Label</label>
            <input
              value={field.label}
              placeholder="e.g. Architect"
              onChange={(e) => setField({ ...field, label: e.target.value })}
            />
          </div>
          <div className="col" style={{ flexBasis: 180 }}>
            <label>Key (optional)</label>
            <input
              value={field.key}
              placeholder="auto from label"
              onChange={(e) => setField({ ...field, key: e.target.value })}
            />
          </div>
          <div className="col" style={{ flexBasis: 160 }}>
            <Select
              label="Type"
              value={field.type}
              onChange={(value) => setField({ ...field, type: value as CustomFieldType })}
              options={TYPES.map((t) => ({ value: t, label: t.replace('_', ' ') }))}
            />
          </div>
          {needsOptions ? (
            <div className="col" style={{ flexBasis: 260 }}>
              <label>Options (comma separated)</label>
              <input
                value={field.options}
                placeholder="Under 1L, 1-5L, 5-10L"
                onChange={(e) => setField({ ...field, options: e.target.value })}
              />
            </div>
          ) : null}
          <div className="col" style={{ flexBasis: 110 }}>
            <Select
              label="Required"
              value={field.required ? 'yes' : 'no'}
              onChange={(value) => setField({ ...field, required: value === 'yes' })}
              options={[
                { value: 'no', label: 'No' },
                { value: 'yes', label: 'Yes' },
              ]}
            />
          </div>
          <button
            className="primary row-action"
            disabled={!field.label.trim()}
            onClick={() =>
              act(async () => {
                await api.createLeadField({
                  key: field.key.trim() || field.label,
                  label: field.label.trim(),
                  type: field.type,
                  options: needsOptions
                    ? field.options.split(',').map((o) => o.trim()).filter(Boolean)
                    : [],
                  required: field.required,
                  sortOrder: fields.length,
                });
                setField({ label: '', key: '', type: 'TEXT', options: '', required: false });
              }, 'Field added — it is already on the lead form.')
            }>
            Add field
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Configured fields</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: -8 }}>
          Removing a field hides it from the form but keeps the values already captured,
          so old leads stay readable.
        </p>
        <table className="table">
          <thead>
            <tr><th>Label</th><th>Key</th><th>Type</th><th>Options</th><th>Required</th><th /></tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.id} style={{ opacity: f.isActive ? 1 : 0.45 }}>
                <td><strong>{f.label}</strong></td>
                <td className="muted">{f.key}</td>
                <td className="muted">{f.type.replace('_', ' ')}</td>
                <td className="muted">{f.options.join(', ') || '—'}</td>
                <td className="muted">{f.required ? 'Yes' : 'No'}</td>
                <td>
                  {f.isActive ? (
                    <button onClick={() => act(() => api.deactivateLeadField(f.id))}>Remove</button>
                  ) : (
                    <button onClick={() => act(() => api.updateLeadField(f.id, { isActive: true }))}>
                      Restore
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {fields.length === 0 ? (
              <tr><td colSpan={6} className="muted">No custom fields yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Lead sources</h3>
        <div className="field-row" style={{ marginBottom: 12 }}>
          <div style={{ width: 150 }}>
            <label>Code</label>
            <input
              value={source.code}
              onChange={(e) => setSource({ ...source, code: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="col" style={{ flexBasis: 220 }}>
            <label>Name</label>
            <input value={source.name} onChange={(e) => setSource({ ...source, name: e.target.value })} />
          </div>
          <button
            className="row-action"
            disabled={!source.code || !source.name}
            onClick={() =>
              act(async () => {
                await api.createLeadSource(source);
                setSource({ code: '', name: '' });
              })
            }>
            Add source
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {sources.map((s) => (
            <span key={s.id} className="pill" style={{ background: s.color ?? 'var(--text-muted)' }}>
              {s.name}
            </span>
          ))}
        </div>
      </div>
    </div>
    </Shell>
  );
}

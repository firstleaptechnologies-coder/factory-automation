'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  CustomFieldDefinition,
  Lead,
  LeadBoard,
  LeadSource,
  Material,
} from '@decor/shared';
import { formatCurrencyInr } from '@/lib/format';
import { Shell } from '@/components/Shell';
import { KanbanBoard } from '@/components/KanbanBoard';
import { CustomFields } from '@/components/CustomFields';
import { ConvertLeadDialog } from '@/components/ConvertLeadDialog';
import { api } from '@/lib/api';

/**
 * The lead dashboard: a pipeline board, plus a create form that is generated
 * from whatever fields the admin has defined.
 */
export default function LeadsPage() {
  const [board, setBoard] = useState<LeadBoard | null>(null);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [converting, setConverting] = useState<Lead | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'success' | 'danger' } | null>(null);

  const [form, setForm] = useState({
    title: '',
    contactName: '',
    contactPhone: '',
    company: '',
    location: '',
    sourceId: '',
    estimatedValue: '',
  });
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});

  const load = useCallback(async () => {
    const [b, s, f] = await Promise.all([api.leadBoard(), api.leadSources(), api.leadFields()]);
    setBoard(b);
    setSources(s);
    setFields(f);
  }, []);

  useEffect(() => {
    load().catch((e) =>
      setMessage({ text: e instanceof Error ? e.message : 'Could not load', tone: 'danger' }),
    );
    api.materials().then(setMaterials).catch(() => undefined);
  }, [load]);

  const create = async () => {
    setMessage(null);
    try {
      await api.createLead({
        title: form.title,
        contactName: form.contactName || undefined,
        contactPhone: form.contactPhone || undefined,
        company: form.company || undefined,
        location: form.location || undefined,
        sourceId: form.sourceId || undefined,
        estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : undefined,
        customFields: customValues,
      });
      setForm({
        title: '', contactName: '', contactPhone: '', company: '',
        location: '', sourceId: '', estimatedValue: '',
      });
      setCustomValues({});
      setShowForm(false);
      await load();
      setMessage({ text: 'Lead created.', tone: 'success' });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Could not create', tone: 'danger' });
    }
  };

  const move = async (lead: Lead, toStatusId: string) => {
    setMessage(null);
    const target = board?.columns.find((c) => c.status.id === toStatusId)?.status;
    const transitions = await api.allowedNext(lead.status.id);
    const transition = transitions.find((t) => t.toStatusId === toStatusId);

    let note: string | undefined;
    if (transition?.requiresNote) {
      const entered = window.prompt(`Moving ${lead.code} to ${target?.name} needs a note. Why?`);
      if (!entered?.trim()) {
        setMessage({ text: 'Move cancelled — a note is required.', tone: 'danger' });
        return;
      }
      note = entered.trim();
    }

    try {
      await api.changeLeadStatus(lead.id, { toStatusId, note });
      await load();
    } catch (e) {
      await load();
      setMessage({ text: e instanceof Error ? e.message : 'Could not move', tone: 'danger' });
    }
  };

  return (
    <Shell>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            {board?.workflow.name ?? 'Loading…'} — drag to move a lead through the pipeline.
          </p>
        </div>
        <div className="spacer" />
        <button className="primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close' : '+ New lead'}
        </button>
      </div>

      {message ? <div className={`banner ${message.tone}`}>{message.text}</div> : null}

      {showForm ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>New lead</h3>
          <div className="field-row">
            <div className="field">
              <label>Title</label>
              <input
                value={form.title}
                placeholder="What is the enquiry for?"
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Contact name</label>
              <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            </div>
            <div className="field">
              <label>Company</label>
              <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div className="field">
              <label>Location</label>
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="field">
              <label>Source</label>
              <select value={form.sourceId} onChange={(e) => setForm({ ...form, sourceId: e.target.value })}>
                <option value="">—</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Estimated value (₹)</label>
              <input
                value={form.estimatedValue}
                inputMode="numeric"
                onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })}
              />
            </div>
          </div>

          {fields.length ? (
            <>
              <h3 style={{ marginTop: 12 }}>Details</h3>
              <CustomFields
                definitions={fields}
                values={customValues}
                onChange={setCustomValues}
              />
            </>
          ) : null}

          <button className="primary" disabled={!form.title.trim()} onClick={create}>
            Create lead
          </button>
        </div>
      ) : null}

      {!board ? (
        <p className="muted">Loading…</p>
      ) : (
        <KanbanBoard
          columns={board.columns.map((column) => ({
            status: column.status,
            items: column.leads,
            subtitle: column.value > 0 ? formatCurrencyInr(column.value) : undefined,
          }))}
          onMove={move}
          emptyLabel="No leads"
          renderCard={(lead) => (
            <div>
              <div className="code">{lead.title}</div>
              <div className="sub">{lead.code}</div>
              <div className="sub">
                {lead.contactName ?? lead.client?.name}
                {lead.contactPhone ? ` · ${lead.contactPhone}` : ''}
              </div>
              {lead.location ? <div className="sub">{lead.location}</div> : null}
              {lead.estimatedValue ? (
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  {formatCurrencyInr(Number(lead.estimatedValue))}
                </div>
              ) : null}
              {lead.source ? (
                <span
                  className="pill"
                  style={{ background: lead.source.color ?? 'var(--text-muted)', marginTop: 6 }}>
                  {lead.source.name}
                </span>
              ) : null}
              {lead.convertedOrder ? (
                <div className="sub" style={{ color: 'var(--success)', marginTop: 6 }}>
                  → {lead.convertedOrder.code}
                </div>
              ) : (
                <button
                  style={{ marginTop: 8, padding: '5px 10px', fontSize: 12 }}
                  onClick={() => setConverting(lead)}>
                  Convert to order
                </button>
              )}
            </div>
          )}
        />
      )}

      {converting ? (
        <ConvertLeadDialog
          lead={converting}
          materials={materials}
          onClose={() => setConverting(null)}
          onConverted={async (order) => {
            setConverting(null);
            await load();
            setMessage({ text: `Converted into ${order.code}.`, tone: 'success' });
          }}
        />
      ) : null}
    </Shell>
  );
}

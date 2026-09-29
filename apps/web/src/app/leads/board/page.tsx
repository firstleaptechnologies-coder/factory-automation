'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  CustomFieldDefinition,
  Lead,
  LeadBoard,
  LeadSource,
  Material,
} from '@fas/shared';
import { PERMISSIONS, leadValue, leadValueSource } from '@fas/shared';
import { formatCurrencyInr } from '@/lib/format';
import { Shell } from '@/components/Shell';
import { KanbanBoard } from '@/components/KanbanBoard';
import { CustomFields } from '@/components/CustomFields';
import { ConvertLeadDialog } from '@/components/ConvertLeadDialog';
import {
  PricedLines,
  PricePreview,
  blankLine,
  usableLines,
  type PricedLine,
} from '@/components/PricedLines';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Select } from '@/ui';

/**
 * The lead dashboard: a pipeline board, plus a create form that is generated
 * from whatever fields the admin has defined.
 */
export default function LeadBoardPage() {
  const router = useRouter();
  const { can } = useAuth();
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
    billingAddress: '',
    shippingAddress: '',
  });
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [lines, setLines] = useState<PricedLine[]>([]);

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
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim(),
        company: form.company || undefined,
        location: form.location || undefined,
        billingAddress: form.billingAddress || undefined,
        shippingAddress: form.shippingAddress || undefined,
        sourceId: form.sourceId || undefined,
        estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : undefined,
        // Left out entirely when nothing was priced, rather than sent empty:
        // an enquiry with no lines is the ordinary case, not a cleared one.
        ...(usableLines(lines).length
          ? {
              items: usableLines(lines).map(({ key: _key, ...line }) => ({
                name: line.name.trim(),
                description: line.description?.trim() || undefined,
                unit: line.unit,
                quantity: line.quantity || undefined,
                ratePerUnit: line.ratePerUnit || undefined,
                discountPct: line.discountPct || undefined,
              })),
            }
          : {}),
        customFields: customValues,
      });
      setForm({
        title: '', contactName: '', contactPhone: '', company: '',
        location: '', sourceId: '', estimatedValue: '',
        billingAddress: '', shippingAddress: '',
      });
      setCustomValues({});
      setLines([]);
      setShowForm(false);
      await load();
      setMessage({ text: 'Lead created.', tone: 'success' });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Could not create', tone: 'danger' });
    }
  };

  /*
   * Write a quote for this enquiry.
   *
   * The estimate screen is handed who it is for and what it is about, so the
   * details typed once on the enquiry are not typed again — and the quote comes
   * back linked, which is what makes "Quoted" mean a quote actually exists.
   */
  const quote = (lead: Lead) => {
    const params = new URLSearchParams({ leadId: lead.id, leadCode: lead.code });
    if (lead.title) params.set('title', lead.title);
    if (lead.client?.id) params.set('clientId', lead.client.id);
    const name = lead.client?.name ?? lead.contactName;
    if (name) params.set('clientName', name);
    if (lead.location) params.set('location', lead.location);
    router.push(`/quotes/new?${params.toString()}`);
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

    /* A card dragged backwards. The same rule orders have — see the order board. */
    let reverse = false;
    let name = target?.name;
    if (!transition && can(PERMISSIONS.LEAD_MOVE_BACK)) {
      const back = await api.allowedBack(lead.status.id);
      const step = back.find((one) => one.toStatus.id === toStatusId);
      if (step) {
        name = step.toStatus.name;
        const asked = window.confirm(
          `${lead.status.name} → ${name} is not a step this pipeline draws. ` +
            `${lead.code} would go back a stage, recorded as a reversal with your name on it. Are you sure?`,
        );
        if (!asked) {
          await load();
          return;
        }
        reverse = true;
        note = window.prompt(`Why is ${lead.code} going back?`)?.trim() || undefined;
      }
    }

    try {
      await api.changeLeadStatus(lead.id, { toStatusId, note, ...(reverse ? { reverse } : {}) });
      await load();
    } catch (e) {
      await load();
      setMessage({ text: e instanceof Error ? e.message : 'Could not move', tone: 'danger' });
    }
  };

  return (
    <Shell>
      <div className="legacy">
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
                onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Client name</label>
              <input
                value={form.contactName}
                placeholder="Who rang?"
                onChange={(e) => setForm((current) => ({ ...current, contactName: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Phone</label>
              <input
                value={form.contactPhone}
                placeholder="The number to ring back on"
                onChange={(e) => setForm((current) => ({ ...current, contactPhone: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Billing address</label>
              <input value={form.billingAddress} onChange={(e) => setForm((current) => ({ ...current, billingAddress: e.target.value }))} />
            </div>
            <div className="field">
              <label>Shipping address</label>
              <input value={form.shippingAddress} onChange={(e) => setForm((current) => ({ ...current, shippingAddress: e.target.value }))} />
            </div>
            <div className="field">
              <label>Company</label>
              <input value={form.company} onChange={(e) => setForm((current) => ({ ...current, company: e.target.value }))} />
            </div>
            <div className="field">
              <label>Location</label>
              <input value={form.location} onChange={(e) => setForm((current) => ({ ...current, location: e.target.value }))} />
            </div>
            <Select
              label="Source"
              value={form.sourceId}
              placeholder="—"
              onChange={(value) => setForm((current) => ({ ...current, sourceId: value }))}
              options={[
                { value: '', label: '—' },
                ...sources.map((source) => ({
                  value: source.id,
                  label: source.name,
                  color: source.color,
                })),
              ]}
            />
            <div className="field">
              <label>Estimated value (₹)</label>
              <input
                value={form.estimatedValue}
                inputMode="numeric"
                onChange={(e) => setForm((current) => ({ ...current, estimatedValue: e.target.value }))}
              />
            </div>
          </div>

          {/*
            Optional, and closed until asked for. Most enquiries are written
            down before anybody has worked out a price, and a dialog that
            opens with an empty line table reads as one demanding a price.
            Where it is priced, the lines are the ones a quotation takes, and
            the quote raised from this enquiry copies them.
          */}
          <h3 style={{ marginTop: 12 }}>Items</h3>
          {lines.length === 0 ? (
            <>
              <p className="muted" style={{ marginTop: -6 }}>
                What they asked for. A rate is optional — put one in if you
                know it, and it carries into the quote.
              </p>
              <button className="ghost" onClick={() => setLines([blankLine()])}>
                Add items
              </button>
            </>
          ) : (
            <>
              <PricedLines
                lines={lines}
                onChange={setLines}
                slabs={undefined}
                tax={false}
                allowEmpty
              />
              <PricePreview lines={lines} treatment="EXCLUSIVE" tax={false} />
            </>
          )}

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

          {/* A name and a number, or there is nobody to ring back — which is
              what the API refuses too, so the button says so first. */}
          <button
            className="primary"
            disabled={
              !form.title.trim() || !form.contactName.trim() || !form.contactPhone.trim()
            }
            onClick={create}>
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
              {/* The quoted figure where a quote went out, the guess where none
                  has — the same rule the column total follows. */}
              {/* The quotation, the priced lines, or the guess — in that
                  order, and labelled so the reader knows which. */}
              {leadValue(lead) !== null ? (
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  {formatCurrencyInr(leadValue(lead)!)}
                  {leadValueSource(lead) === 'quoted' ? (
                    <span className="muted"> quoted</span>
                  ) : null}
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
                <div className="chip-row" style={{ marginTop: 8 }}>
                  <button
                    style={{ padding: '5px 10px', fontSize: 12 }}
                    onClick={() => setConverting(lead)}>
                    Convert to order
                  </button>
                  {can(PERMISSIONS.ESTIMATE_MANAGE) ? (
                    <button
                      style={{ padding: '5px 10px', fontSize: 12 }}
                      onClick={() => quote(lead)}>
                      Quote
                    </button>
                  ) : null}
                </div>
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
    </div>
    </Shell>
  );
}

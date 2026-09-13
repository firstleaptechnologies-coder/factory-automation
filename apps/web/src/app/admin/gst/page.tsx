'use client';

import { useState } from 'react';
import type { GstSlab } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Shell } from '@/components/Shell';
import { Button, Card, Chip, Field, Loader, PageHead, Pill, Sheet } from '@/ui';

const BLANK = { name: '', ratePct: '', isDefault: false, isActive: true };

export default function GstPage() {
  return (
    <Shell>
      <Gst />
    </Shell>
  );
}

/**
 * The rates this shop charges.
 *
 * There was no screen for these on either client. The API has always taken
 * slabs — the punch page and every quote line pick one — but the only way a
 * workspace ever got any was the seeding that runs when it is provisioned. A
 * shop whose slabs were never seeded, or were removed, could not make one:
 * every line stayed at 0% and a registered dealer's bills went out with no tax
 * on them.
 *
 * Rates can be edited, which is safe: a line snapshots the rate and the tax it
 * came to when it is priced, so nothing already quoted, ordered or invoiced
 * moves underneath the shop. The screen says so, because that is the first
 * thing anybody sensible worries about before touching a tax rate.
 */
function Gst() {
  const slabs = useApi<GstSlab[]>(() => api.gstSlabs(true), []);
  const [editing, setEditing] = useState<GstSlab | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rate = Number(form.ratePct);
  const usable = Boolean(form.name.trim()) && form.ratePct.trim() !== '' && rate >= 0 && rate <= 100;

  const openNew = () => {
    setForm(BLANK);
    setError(null);
    setCreating(true);
  };

  const openEdit = (slab: GstSlab) => {
    setForm({
      name: slab.name,
      ratePct: String(Number(slab.ratePct)),
      isDefault: slab.isDefault,
      isActive: slab.isActive,
    });
    setError(null);
    setEditing(slab);
  };

  const close = () => {
    setEditing(null);
    setCreating(false);
    setForm(BLANK);
  };

  const save = async () => {
    if (!usable) return;
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await api.updateGstSlab(editing.id, {
          name: form.name.trim(),
          ratePct: rate,
          isDefault: form.isDefault,
          isActive: form.isActive,
        });
      } else {
        await api.createGstSlab({
          name: form.name.trim(),
          ratePct: rate,
          isDefault: form.isDefault,
        });
      }
      close();
      slabs.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  if (slabs.loading && !slabs.data) return <Loader label="Loading" />;

  const rows = slabs.data ?? [];
  const active = rows.filter((slab) => slab.isActive);

  return (
    <>
      <PageHead
        title="GST rates"
        subtitle={`${active.length} in use`}
        action={<Button title="Add a rate" icon="plus" onClick={openNew} />}
      />

      {/*
        An empty list is not a tidy list — it is a shop that cannot raise a
        legal bill. Say what it means rather than showing an elegant nothing.
      */}
      {rows.length === 0 ? (
        <Card size="sm" testId="no-slabs">
          <strong className="warning">No rates yet</strong>
          <p className="t-small muted">
            Until one exists, every order and quote is priced at 0% and the bills you
            send carry no GST. Most shops here add 18%, 12% and 5%.
          </p>
        </Card>
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Called</th>
                <th className="num">Rate</th>
                <th>On the bill</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((slab) => (
                <tr
                  key={slab.id}
                  style={{ cursor: 'pointer', opacity: slab.isActive ? 1 : 0.5 }}
                  onClick={() => openEdit(slab)}>
                  <td className="bold">{slab.name}</td>
                  <td className="num bold">{Number(slab.ratePct)}%</td>
                  <td className="muted t-small">
                    {Number(slab.ratePct) / 2}% CGST + {Number(slab.ratePct) / 2}% SGST at home,{' '}
                    {Number(slab.ratePct)}% IGST out of state
                  </td>
                  <td>
                    {slab.isDefault ? <Pill label="Default" color="var(--accent)" /> : null}
                    {slab.isActive ? null : <Pill label="Off" color="var(--text-faint)" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Sheet
        open={creating || Boolean(editing)}
        title={editing ? editing.name : 'Add a rate'}
        subtitle="What you charge, and what it is called on the bill"
        onClose={close}>
        {error ? <div className="banner danger">{error}</div> : null}

        <Field
          label="Called"
          placeholder="GST 18%"
          value={form.name}
          onChange={(name) => setForm((current) => ({ ...current, name }))}
        />
        <Field
          label="Rate (%)"
          placeholder="18"
          value={form.ratePct}
          onChange={(ratePct) => setForm((current) => ({ ...current, ratePct }))}
          hint="Split into CGST and SGST at home, charged as IGST out of state."
        />

        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--s-sm)' }}>
          <Chip
            label="Use unless another is picked"
            selected={form.isDefault}
            onClick={() => setForm((current) => ({ ...current, isDefault: !current.isDefault }))}
          />
          {editing ? (
            <Chip
              label={form.isActive ? 'Offered while punching' : 'Not offered'}
              selected={form.isActive}
              onClick={() => setForm((current) => ({ ...current, isActive: !current.isActive }))}
            />
          ) : null}
        </div>

        {/*
          The question anybody asks before changing a tax rate, answered before
          they have to ask it.
        */}
        {editing ? (
          <p className="t-tiny muted">
            Changing this does not touch anything already quoted, ordered or invoiced —
            each line keeps the rate it was priced at.
          </p>
        ) : null}

        <Button
          title={editing ? 'Save' : 'Add it'}
          loading={busy}
          disabled={!usable}
          onClick={save}
          style={{ marginTop: 'var(--s-lg)' }}
        />
      </Sheet>
    </>
  );
}

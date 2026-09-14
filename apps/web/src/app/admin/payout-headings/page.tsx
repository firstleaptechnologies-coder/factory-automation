'use client';

import { useState } from 'react';
import type { DisbursementCategory } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Shell } from '@/components/Shell';
import { Button, Card, Chip, Field, Loader, PageHead, Pill, Sheet } from '@/ui';

const BLANK = { code: '', name: '', isActive: true };

export default function PayoutHeadingsPage() {
  return (
    <Shell>
      <Headings />
    </Shell>
  );
}

/**
 * What a payout is filed under — fitting, transport, polishing.
 *
 * Nothing could create one. The API has always taken them and the payout form
 * has always offered them, but the only way a workspace ever got any was the
 * seeding that runs when it is first provisioned. A shop that was never seeded
 * saw an empty "What for?" on every payout and a ledger reading
 * "Uncategorised" for ever, with nothing anywhere to fix it.
 *
 * A heading is never deleted, only taken out of use: every payout already
 * filed under one points at it, and the ledger has to keep saying what those
 * were for.
 */
function Headings() {
  const headings = useApi<DisbursementCategory[]>(() => api.disbursementCategories(true), []);
  const [editing, setEditing] = useState<DisbursementCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usable = editing
    ? Boolean(form.name.trim())
    : Boolean(form.code.trim()) && Boolean(form.name.trim());

  const openNew = () => {
    setForm(BLANK);
    setError(null);
    setCreating(true);
  };

  const openEdit = (heading: DisbursementCategory) => {
    setForm({ code: heading.code, name: heading.name, isActive: heading.isActive });
    setError(null);
    setEditing(heading);
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
        await api.updateDisbursementCategory(editing.id, {
          name: form.name.trim(),
          isActive: form.isActive,
        });
      } else {
        await api.createDisbursementCategory({
          code: form.code.trim(),
          name: form.name.trim(),
        });
      }
      close();
      headings.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  if (headings.loading && !headings.data) return <Loader label="Loading" />;

  const rows = headings.data ?? [];
  const inUse = rows.filter((row) => row.isActive);

  return (
    <>
      <PageHead
        title="Payout headings"
        subtitle={`${inUse.length} in use`}
        action={<Button title="Add a heading" icon="plus" onClick={openNew} />}
      />

      {/*
        An empty list is not a tidy list — it is a ledger that cannot say what
        any of the money went on.
      */}
      {rows.length === 0 ? (
        <Card size="sm" testId="no-headings">
          <strong className="warning">No headings yet</strong>
          <p className="t-small muted">
            Until one exists, every payout is filed as Uncategorised and the ledger
            cannot tell you what the money went on. Most shops here start with Fitting,
            Transport and Polishing.
          </p>
        </Card>
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Called</th>
                <th>Code</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((heading) => (
                <tr
                  key={heading.id}
                  style={{ cursor: 'pointer', opacity: heading.isActive ? 1 : 0.5 }}
                  onClick={() => openEdit(heading)}>
                  <td className="bold">{heading.name}</td>
                  <td className="muted">{heading.code}</td>
                  <td>
                    {heading.isActive ? null : (
                      <Pill label="Not offered" color="var(--text-faint)" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Sheet
        open={creating || Boolean(editing)}
        title={editing ? editing.name : 'Add a heading'}
        subtitle="What the money went on"
        onClose={close}>
        {error ? <div className="banner danger">{error}</div> : null}

        {editing ? null : (
          <Field
            label="Short code"
            placeholder="FITTING"
            value={form.code}
            onChange={(code) =>
              setForm((current) => ({ ...current, code: code.toUpperCase() }))
            }
            hint="Fixed once it is made — the ledger files against it."
          />
        )}
        <Field
          label="Called"
          placeholder="Fitting"
          value={form.name}
          onChange={(name) => setForm((current) => ({ ...current, name }))}
        />

        {editing ? (
          <>
            <Chip
              label={form.isActive ? 'Offered on a payout' : 'Not offered'}
              selected={form.isActive}
              onClick={() => setForm((current) => ({ ...current, isActive: !current.isActive }))}
            />
            <p className="t-tiny muted">
              Taking one out of use stops it being offered on a new payout. Everything
              already filed under it keeps saying so.
            </p>
          </>
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

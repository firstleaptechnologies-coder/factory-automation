'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { duplicateClientFrom } from '@fas/shared';
import { api } from '@/lib/api';
import { Shell } from '@/components/Shell';
import { Button, Card, Field, PageHead, SectionHead } from '@/ui';

export default function NewClientPage() {
  return (
    <Shell>
      <NewClient />
    </Shell>
  );
}

/**
 * Adding a client, on purpose.
 *
 * A client used to appear only as a side effect of punching an order or
 * writing a quote. That works on the floor and not at a desk, where somebody
 * has a firm's card in front of them and wants them on file before any work
 * exists.
 *
 * Only the name is required. Making a GSTIN a condition of writing a name down
 * is how clients end up on the back of a job card instead of in here.
 */
function NewClient() {
  const router = useRouter();
  const params = useSearchParams();

  const [form, setForm] = useState({
    // Arrived from a search that found nobody: what was typed is far more often
    // the client's name than not.
    name: params.get('name') ?? '',
    phone: '',
    company: '',
    email: '',
    gstin: '',
    billingAddress: '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: string; name: string; code: string } | null>(null);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const trimmed = (value: string) => value.trim() || undefined;
  const named = form.name.trim().length >= 2;

  const save = async () => {
    if (!named) return;
    setBusy(true);
    setError(null);
    setExisting(null);
    try {
      const client = await api.createClient({
        name: form.name.trim(),
        phone: trimmed(form.phone),
        company: trimmed(form.company),
        email: trimmed(form.email),
        gstin: trimmed(form.gstin),
        billingAddress: trimmed(form.billingAddress),
        notes: trimmed(form.notes),
      });
      router.replace(`/clients/${client.id}`);
    } catch (e) {
      /*
       * The server refuses a second client on a number another client already
       * has — that is a firm's ledger split in two. It names the one that
       * exists, which is almost certainly who was being looked for.
       */
      const clash = duplicateClientFrom(e);
      if (clash) setExisting(clash);
      else setError(e instanceof Error ? e.message : 'Could not add this client.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title="New client"
        subtitle="Only the name is needed"
        action={
          <Button title="Back to clients" variant="ghost" onClick={() => router.push('/clients')} />
        }
      />

      {existing ? (
        <Card size="sm" tone="accent">
          <div className="row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t-body bold">Already on file</div>
              <div className="t-small">
                {existing.name} ({existing.code}) has this number. Open them, or
                change the number if this is somebody else.
              </div>
            </div>
            <Button
              title={`Open ${existing.name}`}
              variant="dark"
              onClick={() => router.push(`/clients/${existing.id}`)}
            />
          </div>
        </Card>
      ) : null}

      {error ? (
        <Card size="sm" tone="well">
          <div className="t-small">{error}</div>
        </Card>
      ) : null}

      <SectionHead title="Who they are" />
      <Field
        label="Name"
        placeholder="Who the work is for"
        value={form.name}
        onChange={set('name')}
      />
      <Field
        label="Firm name"
        hint="The trading name on their paperwork, if it differs"
        value={form.company}
        onChange={set('company')}
      />

      <SectionHead title="How to reach them" />
      <Field
        label="Phone"
        placeholder="Optional, but it is what they are found by"
        hint="If this number is already on file, you will be shown that client."
        value={form.phone}
        onChange={set('phone')}
      />
      <Field label="Email" value={form.email} onChange={set('email')} />

      <SectionHead title="For their bills" />
      <Field
        label="GST number"
        placeholder="08AAWFD7264P1ZC"
        value={form.gstin}
        onChange={set('gstin')}
      />
      <Field
        label="Billing address"
        value={form.billingAddress}
        onChange={set('billingAddress')}
        multiline
      />

      <SectionHead title="Notes" />
      <Field
        value={form.notes}
        onChange={set('notes')}
        placeholder="Anything worth remembering — who to ask for, how they pay"
        multiline
      />

      <Button
        title="Add client"
        size="lg"
        onClick={save}
        disabled={!named}
        loading={busy}
        style={{ marginTop: 16 }}
      />
    </>
  );
}

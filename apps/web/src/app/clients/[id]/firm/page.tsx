'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Client } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Shell } from '@/components/Shell';
import {
  Button,
  Card,
  Field,
  Loader,
  PageHead,
  SectionHead,
  looksLikeAddress,
  looksLikeGstin,
  looksLikePhone,
} from '@/ui';

export default function ClientFirmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Shell>
      <ClientFirm clientId={id} />
    </Shell>
  );
}

/**
 * A client's firm details.
 *
 * Everything except the name is optional: an order gets punched off a phone
 * call, and the GSTIN and the billing address turn up later when somebody asks
 * for a bill. They live here rather than on the punch form so filling them in
 * never blocks the floor.
 */
function ClientFirm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const client = useApi<Client>(() => api.client(clientId), [clientId]);

  const [form, setForm] = useState<Partial<Client>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (client.data) setForm(client.data);
  }, [client.data]);

  const set = (key: keyof Client) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.updateClient(clientId, {
        name: form.name,
        phone: form.phone ?? undefined,
        altPhone: form.altPhone ?? undefined,
        email: form.email ?? undefined,
        gstin: form.gstin ?? undefined,
        company: form.company ?? undefined,
        stateCode: form.stateCode ?? undefined,
        stateName: form.stateName ?? undefined,
        address: form.address ?? undefined,
        billingAddress: form.billingAddress ?? undefined,
        shippingAddress: form.shippingAddress ?? undefined,
        notes: form.notes ?? undefined,
      });
      router.push(`/clients/${clientId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  if (client.loading) return <Loader />;

  return (
    <>
      <PageHead
        title="Firm details"
        subtitle={client.data?.name}
        action={<Button title="Save" loading={busy} onClick={save} />}
      />

      {error ? (
        <Card size="sm" style={{ marginBottom: 'var(--s-lg)' }}>
          <span className="t-small danger">{error}</span>
        </Card>
      ) : null}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card>
          <SectionHead title="Who they are" />
          <Field label="Contact name" value={form.name ?? ''} onChange={set('name')} />
          <Field
            label="Firm name"
            hint="The trading name on their paperwork"
            value={form.company ?? ''}
            onChange={set('company')}
          />
          <Field
            label="GST number"
            placeholder="08AAWFD7264P1ZC"
            value={form.gstin ?? ''}
            onChange={set('gstin')}
            pasteAccepts={looksLikeGstin}
          />
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Field
              label="State code"
              placeholder="08"
              value={form.stateCode ?? ''}
              onChange={set('stateCode')}
              style={{ flex: 1 }}
            />
            <Field
              label="State"
              value={form.stateName ?? ''}
              onChange={set('stateName')}
              style={{ flex: 2 }}
            />
          </div>
          <p className="t-tiny faint" style={{ marginTop: -8 }}>
            Their state against yours decides whether their bill shows CGST and
            SGST or a single IGST line.
          </p>

          <SectionHead title="How to reach them" />
          <Field
            label="Phone"
            value={form.phone ?? ''}
            onChange={set('phone')}
            pasteAccepts={looksLikePhone}
          />
          <Field
            label="Alternate number"
            hint="The site contact, usually"
            value={form.altPhone ?? ''}
            onChange={set('altPhone')}
            pasteAccepts={looksLikePhone}
          />
          <Field label="Email" value={form.email ?? ''} onChange={set('email')} />
        </Card>

        <Card>
          <SectionHead title="Addresses" />
          <Field
            label="Billing address"
            hint="Printed on estimates and bills"
            value={form.billingAddress ?? ''}
            onChange={set('billingAddress')}
            multiline
            pasteAccepts={looksLikeAddress}
          />
          <Field
            label="Shipping address"
            hint="Leave empty if the same as billing"
            value={form.shippingAddress ?? ''}
            onChange={set('shippingAddress')}
            multiline
            pasteAccepts={looksLikeAddress}
          />
          <Field
            label="Other address"
            value={form.address ?? ''}
            onChange={set('address')}
            multiline
            pasteAccepts={looksLikeAddress}
          />

          <SectionHead title="Notes" />
          <Field value={form.notes ?? ''} onChange={set('notes')} multiline />
        </Card>
      </div>

      <div style={{ marginTop: 'var(--s-xl)' }}>
        <Button title="Save" size="lg" loading={busy} onClick={save} />
      </div>
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  Estimate,
  EstimateItemInput,
  GstSlab,
  Lead,
  TaxTreatment,
} from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import {
  PricedLines,
  PricePreview,
  TreatmentChips,
  blankLine,
  usableLines,
  type PricedLine as Line,
} from '@/components/PricedLines';
import {
  ClientPicker,
  clientRef,
  hasClient,
  pickedClient,
  typedClient,
  type ClientChoice,
} from '@/components/ClientPicker';
import {
  Button,
  Card,
  Field,
  Loader,
  PageHead,
  SectionHead,
  Sheet,
  SheetOption,
  looksLikeAddress,
} from '@/ui';

/**
 * Writing a quotation.
 *
 * Lines are free text rather than materials and sizes: a quote is usually given
 * before anything has been measured, and pushing it through the punch form
 * would make quoting slower than writing it out by hand.
 */
/** What an enquiry hands over when it is quoted from the lead board. */
export interface QuotingFor {
  id: string;
  code: string;
  title?: string;
  clientId?: string;
  clientName?: string;
  location?: string;
}

export function EstimateForm({
  estimateId,
  lead,
}: {
  estimateId?: string;
  /*
   * A quote is usually written for somebody who rang up, and sometimes for an
   * enquiry already on the board. In the second case the details typed once on
   * the enquiry are not typed again here, and the quote comes back linked.
   */
  lead?: QuotingFor;
}) {
  const router = useRouter();

  const existing = useApi<Estimate | null>(
    async () => (estimateId ? api.estimate(estimateId) : null),
    [estimateId],
  );
  const slabs = useApi<GstSlab[]>(() => api.gstSlabs(), []);

  /*
   * An enquiry that was already priced hands its lines over whole.
   *
   * Fetched rather than carried in the query string: the lines are not
   * something to pack into a URL, and the point of the enquiry carrying them
   * is that nobody re-keys a rate the client has already been told. Only for
   * a new quote — revising an existing one reads its own lines below.
   */
  const quotingFor = useApi<Lead | null>(
    async () => (lead?.id && !estimateId ? api.lead(lead.id) : null),
    [lead?.id, estimateId],
  );

  const [client, setClient] = useState<ClientChoice>(
    lead?.clientId
      ? pickedClient({ id: lead.clientId, name: lead.clientName ?? '' })
      : typedClient(lead?.clientName ?? ''),
  );
  const [billingAddress, setBillingAddress] = useState(lead?.location ?? '');
  const [shippingAddress, setShippingAddress] = useState('');
  const [treatment, setTreatment] = useState<TaxTreatment>('EXCLUSIVE');
  const [notes, setNotes] = useState(lead ? `For enquiry ${lead.code}` : '');
  const [lines, setLines] = useState<Line[]>([
    lead?.title ? { ...blankLine(), name: lead.title } : blankLine(),
  ]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const enquiry = quotingFor.data;
    if (!enquiry?.items?.length) return;
    setTreatment(enquiry.taxTreatment);
    setLines(
      enquiry.items.map((item) => ({
        key: `lead-${item.id}`,
        name: item.name,
        description: item.description ?? undefined,
        hsnSac: item.hsnSac ?? undefined,
        quantity: Number(item.quantity),
        unit: item.unit,
        ratePerUnit: Number(item.ratePerUnit),
        discountPct: Number(item.discountPct) || undefined,
        gstSlabId: item.gstSlabId ?? undefined,
      })),
    );
  }, [quotingFor.data]);

  useEffect(() => {
    const data = existing.data;
    if (!data) return;
    setClient(data.client ? pickedClient(data.client) : typedClient(data.clientName ?? ''));
    setBillingAddress(data.billingAddress ?? '');
    setShippingAddress(data.shippingAddress ?? '');
    setTreatment(data.taxTreatment);
    setNotes(data.notes ?? '');
    setLines(
      data.items.map((item) => ({
        key: item.id,
        name: item.name,
        hsnSac: item.hsnSac ?? undefined,
        quantity: Number(item.quantity),
        unit: item.unit,
        ratePerUnit: Number(item.ratePerUnit),
        discountPct: Number(item.discountPct) || undefined,
        gstSlabId: item.gstSlabId ?? undefined,
      })),
    );
  }, [existing.data]);

  const defaultSlab = slabs.data?.find((slab) => slab.isDefault) ?? slabs.data?.[0];

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        ...clientRef(client),
        leadId: lead?.id,
        billingAddress: billingAddress.trim() || undefined,
        shippingAddress: shippingAddress.trim() || undefined,
        notes: notes.trim() || undefined,
        taxTreatment: treatment,
        items: lines
          .filter((line) => line.name.trim() && line.quantity > 0)
          .map(({ key, ...line }) => ({
            ...line,
            name: line.name.trim(),
            gstSlabId: line.gstSlabId ?? defaultSlab?.id,
          })),
      };

      const saved = estimateId
        ? await api.updateEstimate(estimateId, body)
        : await api.createEstimate(body);
      router.push(`/quotes/${saved.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  if (estimateId && existing.loading) return <Loader label="Loading" />;
  const usable = usableLines(lines).length > 0;

  return (
    <>
      <PageHead
        title={estimateId ? 'Edit estimate' : 'New quote'}
        subtitle={existing.data?.code}
        action={
          <Button
            title={estimateId ? 'Save estimate' : 'Create quote'}
            loading={busy}
            disabled={!usable || !hasClient(client)}
            onClick={save}
          />
        }
      />

      {error ? (
        <Card size="sm" style={{ marginBottom: 'var(--s-lg)' }}>
          <span className="t-small danger">{error}</span>
        </Card>
      ) : null}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card>
          <SectionHead title="Who it is for" />
          <ClientPicker
            value={client}
            onChange={setClient}
            namePlaceholder="Who is this quote for?"
            onPick={(picked) => {
              setBillingAddress(picked.billingAddress ?? picked.address ?? '');
              setShippingAddress(picked.shippingAddress ?? '');
            }}
          />
          <div style={{ height: 'var(--s-lg)' }} />
          <Field
            label="Billing address"
            value={billingAddress}
            onChange={setBillingAddress}
            multiline
            pasteAccepts={looksLikeAddress}
          />
          <Field
            label="Shipping address"
            hint="Leave empty if it is the same"
            value={shippingAddress}
            onChange={setShippingAddress}
            multiline
            pasteAccepts={looksLikeAddress}
          />
          <Field label="Notes" value={notes} onChange={setNotes} multiline />
        </Card>

        <Card>
          <SectionHead title="How GST is quoted" />
          <TreatmentChips treatment={treatment} onChange={setTreatment} />
          <PricePreview
            lines={lines}
            slabs={slabs.data ?? undefined}
            defaultSlabId={defaultSlab?.id}
            treatment={treatment}
          />
        </Card>
      </div>

      <PricedLines lines={lines} onChange={setLines} slabs={slabs.data ?? undefined} />

      <div style={{ marginTop: 'var(--s-xl)' }}>
        <Button
          title={estimateId ? 'Save estimate' : 'Create quote'}
          size="lg"
          loading={busy}
          disabled={!usable || !hasClient(client)}
          onClick={save}
        />
      </div>
    </>
  );
}



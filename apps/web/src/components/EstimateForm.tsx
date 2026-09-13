'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  Estimate,
  EstimateItemInput,
  GstSlab,
  TaxTreatment,
} from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
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
  Chip,
  Field,
  Icon,
  Loader,
  PageHead,
  SectionHead,
  Sheet,
  SheetOption,
  looksLikeAddress,
} from '@/ui';
import { formatInr } from '@/lib/format';

const UNITS = ['Sqf', 'Sqm', 'Rft', 'Nos', 'Lot'];

const TREATMENTS: { value: TaxTreatment; label: string; blurb: string }[] = [
  {
    value: 'EXCLUSIVE',
    label: 'GST on top',
    blurb: 'You quote before tax. The client pays your figure plus GST.',
  },
  {
    value: 'INCLUSIVE',
    label: 'GST included',
    blurb: 'Your figure is what they pay. The GST is already inside it.',
  },
  {
    value: 'ABSORBED',
    label: 'GST absorbed',
    blurb:
      'For a client who cannot take a GST bill: they pay the figure you quoted and you carry the tax out of it.',
  },
];

type Line = EstimateItemInput & { key: string };

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

  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  /**
   * A preview only. The server prices the estimate for real — showing a figure
   * here that the server then disagrees with would be worse than showing none.
   */
  const preview = useMemo(() => {
    let net = 0;
    let tax = 0;
    let discount = 0;

    for (const line of lines) {
      const slab = slabs.data?.find((s) => s.id === (line.gstSlabId ?? defaultSlab?.id));
      const rate = slab ? Number(slab.ratePct) : 0;
      const gross = (line.quantity || 0) * (line.ratePerUnit || 0);
      const off = (gross * (line.discountPct || 0)) / 100;
      const afterDiscount = gross - off;

      discount += off;
      if (treatment === 'EXCLUSIVE') {
        net += afterDiscount;
        tax += (afterDiscount * rate) / 100;
      } else {
        const lineNet = afterDiscount / (1 + rate / 100);
        net += lineNet;
        tax += afterDiscount - lineNet;
      }
    }

    return { net, tax, discount, gross: net + tax };
  }, [lines, slabs.data, defaultSlab, treatment]);

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
  const usable = lines.some((line) => line.name.trim() && line.quantity > 0);

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
          <div className="wrap">
            {TREATMENTS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={treatment === option.value}
                onClick={() => setTreatment(option.value)}
              />
            ))}
          </div>
          <p className="t-tiny faint" style={{ marginTop: 'var(--s-md)' }}>
            {TREATMENTS.find((option) => option.value === treatment)?.blurb}
          </p>

          <SectionHead title="Preview" />
          <p className="t-tiny faint" style={{ marginTop: -8 }}>
            The server prices it for real when you save.
          </p>
          <Row label="Taxable" value={formatInr(preview.net)} />
          {preview.discount > 0 ? (
            <Row label="Discount" value={formatInr(preview.discount)} />
          ) : null}
          <Row label="GST" value={formatInr(preview.tax)} />
          <div className="divider" />
          <Row label="Client pays" value={formatInr(preview.gross)} accent />
        </Card>
      </div>

      <SectionHead
        title="Lines"
        action={
          <Button
            title="Add a line"
            variant="dark"
            size="sm"
            icon="plus"
            onClick={() => setLines((current) => [...current, blankLine()])}
          />
        }
      />

      <div className="stack-sm">
        {lines.map((line, index) => {
          const slab = slabs.data?.find((s) => s.id === (line.gstSlabId ?? defaultSlab?.id));
          const gross = (line.quantity || 0) * (line.ratePerUnit || 0);
          const off = (gross * (line.discountPct || 0)) / 100;

          return (
            <Card key={line.key} size="sm">
              <div className="row-between" style={{ marginBottom: 'var(--s-sm)' }}>
                <span className="t-tiny faint">LINE {index + 1}</span>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      setLines((current) => current.filter((l) => l.key !== line.key))
                    }>
                    <Icon name="trash" size={15} />
                  </button>
                ) : null}
              </div>

              <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <Field
                  label="Item"
                  placeholder="Hdmr cutting 22mm"
                  value={line.name}
                  onChange={(value) => setLine(line.key, { name: value })}
                  style={{ flex: '3 1 220px' }}
                />
                <Field
                  label="HSN/SAC"
                  value={line.hsnSac ?? ''}
                  onChange={(value) => setLine(line.key, { hsnSac: value })}
                  style={{ flex: '1 1 110px' }}
                />
                <Field
                  label="Qty"
                  value={line.quantity ? String(line.quantity) : ''}
                  onChange={(value) => setLine(line.key, { quantity: Number(value) || 0 })}
                  style={{ flex: '1 1 90px' }}
                  pasteable={false}
                />
                <Field
                  label="Rate"
                  value={line.ratePerUnit ? String(line.ratePerUnit) : ''}
                  onChange={(value) => setLine(line.key, { ratePerUnit: Number(value) || 0 })}
                  style={{ flex: '1 1 110px' }}
                  pasteable={false}
                />
                <Field
                  label="Disc %"
                  value={line.discountPct ? String(line.discountPct) : ''}
                  onChange={(value) => setLine(line.key, { discountPct: Number(value) || 0 })}
                  style={{ flex: '1 1 90px' }}
                  pasteable={false}
                />
              </div>

              <div className="wrap">
                {UNITS.map((unit) => (
                  <Chip
                    key={unit}
                    label={unit}
                    selected={(line.unit ?? 'Sqf') === unit}
                    onClick={() => setLine(line.key, { unit })}
                  />
                ))}
                <span style={{ width: 'var(--s-lg)' }} />
                {(slabs.data ?? []).map((option) => (
                  <Chip
                    key={option.id}
                    label={`GST ${Number(option.ratePct)}%`}
                    selected={(line.gstSlabId ?? defaultSlab?.id) === option.id}
                    onClick={() => setLine(line.key, { gstSlabId: option.id })}
                  />
                ))}
              </div>

              {gross > 0 ? (
                <p className="t-tiny faint" style={{ marginTop: 'var(--s-sm)' }}>
                  {formatInr(gross)}
                  {off > 0 ? ` less ${formatInr(off)} discount` : ''}
                  {slab ? ` · GST ${Number(slab.ratePct)}%` : ''}
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>

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

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="row-between" style={{ padding: '3px 0' }}>
      <span className="t-small muted">{label}</span>
      <span className={accent ? 't-h3 accent' : 't-body bold'}>{value}</span>
    </div>
  );
}

function blankLine(): Line {
  return {
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    quantity: 0,
    unit: 'Sqf',
    ratePerUnit: 0,
  };
}

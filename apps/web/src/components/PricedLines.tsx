'use client';

import { useMemo } from 'react';
import type { GstSlab, TaxTreatment } from '@fas/shared';
import { Button, Card, Chip, Field, Icon, SectionHead } from '@/ui';
import { formatInr } from '@/lib/format';

/**
 * The priced lines of a document, and the chips that set them.
 *
 * One editor, used by the quotation and by the enquiry that is quoted from
 * it — the same split the app makes, for the same reason. They were the same
 * form written twice, and the second copy starts drifting the moment either
 * is touched.
 *
 * Lines are free text rather than materials and sizes: a price is usually
 * given before anything has been measured, and pushing it through the punch
 * form would make quoting slower than writing it out by hand.
 */

/** A line being edited. `key` is local: it is how a row is identified on screen. */
export type PricedLine = {
  key: string;
  name: string;
  description?: string;
  hsnSac?: string;
  quantity: number;
  unit?: string;
  ratePerUnit: number;
  discountPct?: number;
  gstSlabId?: string;
};

export const UNITS = ['Sqf', 'Sqm', 'Rft', 'Nos', 'Lot'];

export const TREATMENTS: { value: TaxTreatment; label: string; blurb: string }[] = [
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

export function blankLine(): PricedLine {
  return {
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    quantity: 0,
    unit: 'Sqf',
    ratePerUnit: 0,
  };
}

/** The lines worth sending: named, and for more than nothing. */
export const usableLines = (lines: PricedLine[]): PricedLine[] =>
  lines.filter((line) => line.name.trim() && line.quantity > 0);

/**
 * What the lines come to, as the server will work it out.
 *
 * Mirrors common/pricing/quote-lines.ts on the API, which is the authority.
 * Kept as a preview rather than a claim: the figure shown says so.
 */
export function previewTotals(
  lines: PricedLine[],
  slabs: GstSlab[] | undefined,
  defaultSlabId: string | undefined,
  treatment: TaxTreatment,
) {
  let net = 0;
  let tax = 0;
  let discount = 0;

  for (const line of usableLines(lines)) {
    const slab = slabs?.find((s) => s.id === (line.gstSlabId ?? defaultSlabId));
    const rate = slab ? Number(slab.ratePct) : 0;
    const gross = (line.quantity || 0) * (line.ratePerUnit || 0);
    const off = (gross * (line.discountPct || 0)) / 100;
    const afterDiscount = gross - off;

    discount += off;
    if (treatment === 'EXCLUSIVE') {
      net += afterDiscount;
      tax += (afterDiscount * rate) / 100;
    } else {
      // The quoted figure already contains the tax, so it comes out of it
      // rather than being added on top.
      const lineNet = afterDiscount / (1 + rate / 100);
      net += lineNet;
      tax += afterDiscount - lineNet;
    }
  }

  return { net, tax, discount, gross: net + tax };
}

/** How GST is quoted, and the effect of choosing differently. */
export function TreatmentChips({
  treatment,
  onChange,
}: {
  treatment: TaxTreatment;
  onChange: (next: TaxTreatment) => void;
}) {
  return (
    <>
      <div className="wrap">
        {TREATMENTS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={treatment === option.value}
            onClick={() => onChange(option.value)}
          />
        ))}
      </div>
      <p className="t-tiny faint" style={{ marginTop: 'var(--s-md)' }}>
        {TREATMENTS.find((option) => option.value === treatment)?.blurb}
      </p>
    </>
  );
}

/** The totals, which the server has the last word on. */
export function PricePreview({
  lines,
  slabs,
  defaultSlabId,
  treatment,
}: {
  lines: PricedLine[];
  slabs?: GstSlab[];
  defaultSlabId?: string;
  treatment: TaxTreatment;
}) {
  const preview = useMemo(
    () => previewTotals(lines, slabs, defaultSlabId, treatment),
    [lines, slabs, defaultSlabId, treatment],
  );

  return (
    <>
      <SectionHead title="Preview" />
      <p className="t-tiny faint" style={{ marginTop: -8 }}>
        The server prices it for real when you save.
      </p>
      <SumRow label="Taxable" value={formatInr(preview.net)} />
      {preview.discount > 0 ? (
        <SumRow label="Discount" value={formatInr(preview.discount)} />
      ) : null}
      <SumRow label="GST" value={formatInr(preview.tax)} />
      <div className="divider" />
      <SumRow label="Client pays" value={formatInr(preview.gross)} accent />
    </>
  );
}

export function PricedLines({
  lines,
  onChange,
  slabs,
  /** Whether the last line can be removed. A quote needs one; an enquiry does not. */
  allowEmpty = false,
}: {
  lines: PricedLine[];
  onChange: (next: PricedLine[]) => void;
  slabs?: GstSlab[];
  allowEmpty?: boolean;
}) {
  const defaultSlab = slabs?.find((slab) => slab.isDefault) ?? slabs?.[0];

  const setLine = (key: string, patch: Partial<PricedLine>) =>
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  return (
    <>
      <SectionHead
        title="Lines"
        action={
          <Button
            title="Add a line"
            variant="dark"
            size="sm"
            icon="plus"
            onClick={() => onChange([...lines, blankLine()])}
          />
        }
      />

      <div className="stack-sm">
        {lines.map((line, index) => {
          const slab = slabs?.find((s) => s.id === (line.gstSlabId ?? defaultSlab?.id));
          const gross = (line.quantity || 0) * (line.ratePerUnit || 0);
          const off = (gross * (line.discountPct || 0)) / 100;

          return (
            <Card key={line.key} size="sm">
              <div className="row-between" style={{ marginBottom: 'var(--s-sm)' }}>
                <span className="t-tiny faint">LINE {index + 1}</span>
                {allowEmpty || lines.length > 1 ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Remove line ${index + 1}`}
                    onClick={() => onChange(lines.filter((l) => l.key !== line.key))}>
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
                {(slabs ?? []).map((option) => (
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
    </>
  );
}

function SumRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="row-between" style={{ padding: '3px 0' }}>
      <span className="t-small muted">{label}</span>
      <span className={accent ? 't-h3 accent' : 't-body'}>{value}</span>
    </div>
  );
}

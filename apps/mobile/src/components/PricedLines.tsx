import React, { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, Layout } from 'react-native-reanimated';
import type { GstSlab, TaxTreatment } from '@fas/shared';
import { Button, Card, Chip, Field, Icon, Sheet, SheetOption, Text } from '../ui';
import { palette, spacing } from '../theme';
import { formatInr } from '../lib/format';

/**
 * The priced lines of a document, and the chips that set them.
 *
 * One editor, used by the quotation and by the enquiry that is quoted from
 * it. They were the same form typed out twice — same fields, same units, same
 * slab sheet — and the second copy was already drifting: the enquiry's chips
 * had test handles and the quote's did not, which is how two forms that are
 * supposed to be identical stop being identical.
 *
 * Lines are free text rather than materials and sizes, for both: a price is
 * usually given before anything has been measured, and pushing it through the
 * punch form would make quoting slower than writing it out by hand.
 *
 * The totals shown are a preview. The server prices the document for real —
 * showing a figure here that the server then disagrees with would be worse
 * than showing none, so it says so.
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

export function PricedLines({
  lines,
  onChange,
  treatment,
  onTreatmentChange,
  slabs,
  /** Whether the last line can be removed. A quote needs one; an enquiry does not. */
  allowEmpty = false,
  placeholder = 'Hdmr cutting 22mm',
}: {
  lines: PricedLine[];
  onChange: (next: PricedLine[]) => void;
  treatment: TaxTreatment;
  onTreatmentChange: (next: TaxTreatment) => void;
  slabs?: GstSlab[];
  allowEmpty?: boolean;
  placeholder?: string;
}) {
  const [slabFor, setSlabFor] = React.useState<string | null>(null);
  const [unitFor, setUnitFor] = React.useState<string | null>(null);

  const defaultSlab = slabs?.find((slab) => slab.isDefault) ?? slabs?.[0];

  const setLine = (key: string, patch: Partial<PricedLine>) =>
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const preview = useMemo(
    () => previewTotals(lines, slabs, defaultSlab?.id, treatment),
    [lines, slabs, defaultSlab, treatment],
  );

  return (
    <>
      <Text variant="label" tone="muted" style={styles.label}>How is GST quoted?</Text>
      <View style={styles.chipWrap}>
        {TREATMENTS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={treatment === option.value}
            onPress={() => onTreatmentChange(option.value)}
          />
        ))}
      </View>
      <Text variant="tiny" tone="faint" style={styles.blurb}>
        {TREATMENTS.find((option) => option.value === treatment)?.blurb}
      </Text>

      {lines.map((line, index) => {
        const slab = slabs?.find((s) => s.id === (line.gstSlabId ?? defaultSlab?.id));
        const gross = (line.quantity || 0) * (line.ratePerUnit || 0);
        const off = (gross * (line.discountPct || 0)) / 100;

        return (
          <Animated.View key={line.key} entering={FadeIn.duration(200)} layout={Layout}>
            <Card tone="dark" style={styles.line}>
              <View style={styles.lineHead}>
                <Text variant="tiny" tone="faint">LINE {index + 1}</Text>
                {allowEmpty || lines.length > 1 ? (
                  <Chip
                    label="Remove"
                    testID={`remove-line-${index}`}
                    onPress={() => onChange(lines.filter((l) => l.key !== line.key))}
                  />
                ) : null}
              </View>

              <Field
                placeholder={placeholder}
                value={line.name}
                onChangeText={(value) => setLine(line.key, { name: value })}
              />

              <View style={styles.row}>
                <Field
                  label="Qty"
                  value={line.quantity ? String(line.quantity) : ''}
                  onChangeText={(value) => setLine(line.key, { quantity: Number(value) || 0 })}
                  keyboardType="decimal-pad"
                  containerStyle={{ flex: 1 }}
                  pasteable={false}
                />
                <Field
                  label="Rate"
                  value={line.ratePerUnit ? String(line.ratePerUnit) : ''}
                  onChangeText={(value) => setLine(line.key, { ratePerUnit: Number(value) || 0 })}
                  keyboardType="decimal-pad"
                  containerStyle={{ flex: 1 }}
                  pasteable={false}
                />
                <Field
                  label="Disc %"
                  value={line.discountPct ? String(line.discountPct) : ''}
                  onChangeText={(value) => setLine(line.key, { discountPct: Number(value) || 0 })}
                  keyboardType="decimal-pad"
                  containerStyle={{ flex: 1 }}
                  pasteable={false}
                />
              </View>

              <View style={styles.chipWrap}>
                <Chip
                  label={line.unit ?? 'Sqf'}
                  testID={`unit-${index}`}
                  onPress={() => setUnitFor(line.key)}
                />
                <Chip
                  label={slab ? `GST ${Number(slab.ratePct)}%` : 'GST'}
                  testID={`slab-${index}`}
                  onPress={() => setSlabFor(line.key)}
                />
                <Chip
                  label={line.hsnSac ? `HSN ${line.hsnSac}` : '+ HSN/SAC'}
                  testID={`hsn-${index}`}
                  onPress={() =>
                    Alert.prompt?.('HSN / SAC', 'Optional code for this line', (value) =>
                      setLine(line.key, { hsnSac: value }),
                    )
                  }
                />
              </View>

              {gross > 0 ? (
                <Text variant="tiny" tone="faint" style={{ marginTop: spacing.sm }}>
                  {formatInr(gross)}
                  {off > 0 ? ` less ${formatInr(off)} discount` : ''}
                </Text>
              ) : null}
            </Card>
          </Animated.View>
        );
      })}

      <Button
        title="Add a line"
        variant="dark"
        testID="add-line"
        icon={<Icon name="plus" size={16} color={palette.text} />}
        onPress={() => onChange([...lines, blankLine()])}
      />

      {/*
        Shown from the first line onwards, even at zero. A total that appears
        only once a line is "good enough" reads as the form having decided
        something; at zero it is simply what has been typed so far, and it is
        where the tax treatment's effect becomes visible.
      */}
      <Card tone="dark" style={{ marginTop: spacing.lg }}>
        <Text variant="label" tone="muted">Preview</Text>
        <Text variant="tiny" tone="faint" style={{ marginBottom: spacing.sm }}>
          The server prices it for real when you save.
        </Text>
        <SumRow label="Taxable" value={formatInr(preview.net)} />
        {preview.discount > 0 ? (
          <SumRow label="Discount" value={formatInr(preview.discount)} />
        ) : null}
        <SumRow label="GST" value={formatInr(preview.tax)} />
        <SumRow label="Client pays" value={formatInr(preview.gross)} accent />
      </Card>

      <Sheet visible={Boolean(unitFor)} title="Unit" onClose={() => setUnitFor(null)}>
        {UNITS.map((unit) => (
          <SheetOption
            key={unit}
            label={unit}
            onPress={() => {
              if (unitFor) setLine(unitFor, { unit });
              setUnitFor(null);
            }}
          />
        ))}
      </Sheet>

      <Sheet visible={Boolean(slabFor)} title="GST slab" onClose={() => setSlabFor(null)}>
        {(slabs ?? []).map((slab) => (
          <SheetOption
            key={slab.id}
            label={slab.name}
            description={`${Number(slab.ratePct)}%`}
            onPress={() => {
              if (slabFor) setLine(slabFor, { gstSlabId: slab.id });
              setSlabFor(null);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

function SumRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.sumRow}>
      <Text variant="small" tone="muted">{label}</Text>
      <Text variant={accent ? 'h3' : 'body'} tone={accent ? 'accent' : 'default'} bold>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  blurb: { marginBottom: spacing.md, lineHeight: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  line: { marginBottom: spacing.md },
  lineHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  sumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
});

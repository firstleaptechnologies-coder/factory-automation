import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, Layout } from 'react-native-reanimated';
import type {
  CustomFieldDefinition,
  GstSlab,
  LeadItemInput,
  LeadSource,
  TaxTreatment,
} from '@fas/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { CustomFieldInputs } from '../components/CustomFieldInputs';
import {
  Button,
  Card,
  Chip,
  Field,
  Icon,
  Loader,
  Screen,
  ScreenHeader,
  Sheet,
  SheetOption,
  Text,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatInr } from '../lib/format';

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

type Line = LeadItemInput & { key: string };

/**
 * New enquiry.
 *
 * Two halves, and the split is deliberate. The top is what an enquiry has
 * always needed — who rang, what about, where — and it stays as cheap as it
 * was: a title and a way to reach somebody is enough, because an enquiry that
 * takes five minutes to log is an enquiry nobody logs.
 *
 * Under it is the pricing, in exactly the shape a quotation takes it: name,
 * quantity, unit, rate, discount, GST slab, HSN. Not the punch form's
 * materials and sizes — an enquiry is priced before anything has been
 * measured, which is the same reason Quotes does not use it either. It is
 * optional and collapsed until asked for, so the common case is untouched,
 * and what is typed here carries straight into the quote rather than being
 * keyed a second time.
 *
 * The lower half is whatever the admin defined.
 */
export function LeadCreateScreen({ navigation }: { navigation: any }) {
  const sources = useApi<LeadSource[]>(() => api.leadSources(), []);
  const fields = useApi<CustomFieldDefinition[]>(() => api.leadFields(), []);
  const slabs = useApi<GstSlab[]>(() => api.gstSlabs(), []);

  const [title, setTitle] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [estimatedValue, setEstimatedValue] = useState('');
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);

  const [pricing, setPricing] = useState(false);
  const [treatment, setTreatment] = useState<TaxTreatment>('EXCLUSIVE');
  const [lines, setLines] = useState<Line[]>([]);
  const [slabFor, setSlabFor] = useState<string | null>(null);
  const [unitFor, setUnitFor] = useState<string | null>(null);

  const defaultSlab = slabs.data?.find((slab) => slab.isDefault) ?? slabs.data?.[0];

  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  const usable = lines.filter((line) => line.name.trim() && line.quantity > 0);

  /**
   * A preview only. The server prices it for real — showing a figure here
   * that the server then disagrees with would be worse than showing none.
   */
  const preview = useMemo(() => {
    let net = 0;
    let tax = 0;

    for (const line of usable) {
      const slab = slabs.data?.find((s) => s.id === (line.gstSlabId ?? defaultSlab?.id));
      const rate = slab ? Number(slab.ratePct) : 0;
      const gross = (line.quantity || 0) * (line.ratePerUnit || 0);
      const afterDiscount = gross - (gross * (line.discountPct || 0)) / 100;

      if (treatment === 'EXCLUSIVE') {
        net += afterDiscount;
        tax += (afterDiscount * rate) / 100;
      } else {
        const lineNet = afterDiscount / (1 + rate / 100);
        net += lineNet;
        tax += afterDiscount - lineNet;
      }
    }

    return { net, tax, gross: net + tax };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, slabs.data, defaultSlab, treatment]);

  const submit = async () => {
    setBusy(true);
    try {
      const lead = await api.createLead({
        title: title.trim(),
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        company: company.trim() || undefined,
        location: location.trim() || undefined,
        sourceId: sourceId ?? undefined,
        estimatedValue: estimatedValue ? Number(estimatedValue) : undefined,
        // Left out entirely when nothing was priced, rather than sent empty:
        // an enquiry with no lines is the ordinary case, not a cleared one.
        ...(usable.length
          ? {
              taxTreatment: treatment,
              items: usable.map(({ key: _key, ...line }) => ({
                ...line,
                name: line.name.trim(),
                gstSlabId: line.gstSlabId ?? defaultSlab?.id,
              })),
            }
          : {}),
        customFields: custom,
      });
      haptic('notificationSuccess');
      navigation.replace('LeadDetail', { leadId: lead.id });
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not create', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (sources.loading && !sources.data) return <Loader />;

  return (
    <Screen>
      <ScreenHeader title="New lead" onBack={() => navigation.goBack()} />

      <Animated.View entering={FadeInDown.duration(320)}>
        <Field
          label="What is the enquiry for?"
          placeholder="e.g. Marble kitchen counters"
          value={title}
          onChangeText={setTitle}
          icon="tag"
        />
        <Field
          label="Contact name"
          value={contactName}
          onChangeText={setContactName}
          icon="user"
        />
        <Field
          label="Phone"
          value={contactPhone}
          onChangeText={setContactPhone}
          keyboardType="phone-pad"
          icon="phone"
        />
        <Field label="Company" value={company} onChangeText={setCompany} />
        <Field label="Location" value={location} onChangeText={setLocation} icon="pin" />
        <Field
          label="Estimated value (₹)"
          hint="A guess. Price it line by line below if you have the numbers."
          value={estimatedValue}
          onChangeText={setEstimatedValue}
          keyboardType="numeric"
        />

        <Text variant="label" tone="muted" style={styles.label}>Source</Text>
        <View style={styles.chipWrap}>
          {sources.data?.map((source) => (
            <Chip
              key={source.id}
              label={source.name}
              accent={source.color}
              selected={sourceId === source.id}
              onPress={() => setSourceId(sourceId === source.id ? null : source.id)}
            />
          ))}
        </View>

        {/*
          Closed until asked for. Most enquiries are taken before anybody has
          worked out a price, and a form that opens with an empty line table
          reads as a form demanding one.
        */}
        <Text variant="h3" style={styles.section}>Pricing</Text>
        {!pricing && lines.length === 0 ? (
          <>
            <Text variant="tiny" tone="faint" style={styles.blurb}>
              Optional. Priced here, it carries straight into the quote.
            </Text>
            <Button
              title="Price this enquiry"
              variant="dark"
              testID="start-pricing"
              icon={<Icon name="plus" size={16} color={palette.text} />}
              onPress={() => {
                setPricing(true);
                setLines([blankLine()]);
              }}
            />
          </>
        ) : (
          <>
            <Text variant="label" tone="muted" style={styles.label}>How is GST quoted?</Text>
            <View style={styles.chipWrap}>
              {TREATMENTS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={treatment === option.value}
                  onPress={() => setTreatment(option.value)}
                />
              ))}
            </View>
            <Text variant="tiny" tone="faint" style={styles.blurb}>
              {TREATMENTS.find((option) => option.value === treatment)?.blurb}
            </Text>

            {lines.map((line, index) => {
              const slab = slabs.data?.find((s) => s.id === (line.gstSlabId ?? defaultSlab?.id));
              const gross = (line.quantity || 0) * (line.ratePerUnit || 0);
              const off = (gross * (line.discountPct || 0)) / 100;

              return (
                <Animated.View key={line.key} entering={FadeIn.duration(200)} layout={Layout}>
                  <Card tone="dark" style={styles.line}>
                    <View style={styles.lineHead}>
                      <Text variant="tiny" tone="faint">LINE {index + 1}</Text>
                      <Chip
                        label="Remove"
                        testID={`remove-line-${index}`}
                        onPress={() =>
                          setLines((current) => current.filter((l) => l.key !== line.key))
                        }
                      />
                    </View>

                    <Field
                      placeholder="Hdmr cutting 22mm"
                      value={line.name}
                      onChangeText={(value) => setLine(line.key, { name: value })}
                    />

                    <View style={styles.row}>
                      <Field
                        label="Qty"
                        value={line.quantity ? String(line.quantity) : ''}
                        onChangeText={(value) =>
                          setLine(line.key, { quantity: Number(value) || 0 })
                        }
                        keyboardType="decimal-pad"
                        containerStyle={{ flex: 1 }}
                        pasteable={false}
                      />
                      <Field
                        label="Rate"
                        value={line.ratePerUnit ? String(line.ratePerUnit) : ''}
                        onChangeText={(value) =>
                          setLine(line.key, { ratePerUnit: Number(value) || 0 })
                        }
                        keyboardType="decimal-pad"
                        containerStyle={{ flex: 1 }}
                        pasteable={false}
                      />
                      <Field
                        label="Disc %"
                        value={line.discountPct ? String(line.discountPct) : ''}
                        onChangeText={(value) =>
                          setLine(line.key, { discountPct: Number(value) || 0 })
                        }
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
              onPress={() => setLines((current) => [...current, blankLine()])}
            />

            {usable.length ? (
              <Card tone="dark" style={{ marginTop: spacing.lg }}>
                <Text variant="label" tone="muted">Preview</Text>
                <Text variant="tiny" tone="faint" style={{ marginBottom: spacing.sm }}>
                  The server prices it for real when you save.
                </Text>
                <SumRow label="Taxable" value={formatInr(preview.net)} />
                <SumRow label="GST" value={formatInr(preview.tax)} />
                <SumRow label="Client pays" value={formatInr(preview.gross)} accent />
              </Card>
            ) : null}
          </>
        )}

        {fields.data?.length ? (
          <>
            <Text variant="h3" style={styles.section}>Details</Text>
            <Text variant="tiny" tone="faint" style={{ marginBottom: spacing.lg }}>
              Configured by your admin
            </Text>
            <CustomFieldInputs
              definitions={fields.data}
              values={custom}
              onChange={setCustom}
            />
          </>
        ) : null}

        <Button
          title="Create lead"
          size="lg"
          loading={busy}
          disabled={!title.trim()}
          onPress={submit}
          style={{ marginTop: spacing.lg }}
        />
      </Animated.View>

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
        {(slabs.data ?? []).map((slab) => (
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
    </Screen>
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

function blankLine(): Line {
  return {
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    quantity: 0,
    unit: 'Sqf',
    ratePerUnit: 0,
  };
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  blurb: { marginBottom: spacing.md, lineHeight: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  section: { marginTop: spacing.xl, marginBottom: spacing.sm },
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

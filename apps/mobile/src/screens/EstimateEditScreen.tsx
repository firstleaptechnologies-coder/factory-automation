import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, Layout } from 'react-native-reanimated';
import type {
  Client,
  Estimate,
  EstimateItemInput,
  GstSlab,
  TaxTreatment,
} from '@fas/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { ContactPickerSheet } from '../components/ContactPickerSheet';
import { looksLikeAddress } from '../hooks/useClipboardSuggestion';
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

type Line = EstimateItemInput & { key: string };

/**
 * Writing a quotation.
 *
 * Lines are free text rather than materials and sizes: a quote is usually given
 * before anything has been measured, and pushing it through the punch form
 * would make quoting slower than writing it out by hand.
 */
export function EstimateEditScreen({ route, navigation }: { route: any; navigation: any }) {
  /*
   * A quote is usually written for somebody who rang up, and sometimes for an
   * enquiry already on the board. In the second case the screen is opened from
   * that enquiry, which hands over who it is for and what it is about, so the
   * same details are not typed a second time.
   */
  const { estimateId, lead } = (route.params ?? {}) as {
    estimateId?: string;
    lead?: {
      id: string;
      code: string;
      title?: string;
      clientId?: string | null;
      clientName?: string | null;
      location?: string | null;
    };
  };

  const existing = useApi<Estimate | null>(
    async () => (estimateId ? api.estimate(estimateId) : null),
    [estimateId],
  );
  const slabs = useApi<GstSlab[]>(() => api.gstSlabs(), []);

  const [clientId, setClientId] = useState<string | undefined>(lead?.clientId ?? undefined);
  const [clientName, setClientName] = useState(lead?.clientName ?? '');
  const [billingAddress, setBillingAddress] = useState(lead?.location ?? '');
  const [shippingAddress, setShippingAddress] = useState('');
  const [treatment, setTreatment] = useState<TaxTreatment>('EXCLUSIVE');
  const [notes, setNotes] = useState(lead ? `For enquiry ${lead.code}` : '');
  const [lines, setLines] = useState<Line[]>([
    lead?.title ? { ...blankLine(), name: lead.title } : blankLine(),
  ]);

  const [contactSheet, setContactSheet] = useState(false);
  const [clientSheet, setClientSheet] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [slabFor, setSlabFor] = useState<string | null>(null);
  const [unitFor, setUnitFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const clients = useApi<{ data: Client[] }>(
    () => api.clients({ search: clientSearch || undefined, limit: 20 }),
    [clientSearch],
  );

  React.useEffect(() => {
    const data = existing.data;
    if (!data) return;
    setClientId(data.clientId ?? undefined);
    setClientName(data.client?.name ?? data.clientName ?? '');
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
    try {
      const body = {
        clientId,
        leadId: lead?.id,
        clientName: clientName.trim() || undefined,
        billingAddress: billingAddress.trim() || undefined,
        shippingAddress: shippingAddress.trim() || undefined,
        notes: notes.trim() || undefined,
        taxTreatment: treatment,
        items: lines
          .filter((line) => line.name.trim() && line.quantity > 0)
          .map(({ key: _key, ...line }) => ({
            ...line,
            name: line.name.trim(),
            gstSlabId: line.gstSlabId ?? defaultSlab?.id,
          })),
      };

      const saved = estimateId
        ? await api.updateEstimate(estimateId, body)
        : await api.createEstimate(body);

      haptic('notificationSuccess');
      navigation.replace('EstimateDetail', { estimateId: saved.id });
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (estimateId && !existing.data) return <Loader label="Loading" />;

  const usable = lines.some((line) => line.name.trim() && line.quantity > 0);

  return (
    <Screen>
      <ScreenHeader
        title={estimateId ? 'Edit quote' : 'New quote'}
        subtitle={existing.data?.code}
        onBack={() => navigation.goBack()}
      />

      <Text variant="label" tone="muted" style={styles.block}>Who is it for?</Text>
      <Field
        label="Client"
        placeholder="Type a name"
        value={clientName}
        onChangeText={(value) => {
          setClientName(value);
          // Typing over a chosen client detaches it: the estimate should not
          // silently keep pointing at a record the name no longer matches.
          setClientId(undefined);
        }}
      />
      <View style={styles.chipWrap}>
        <Chip label="From contacts" onPress={() => setContactSheet(true)} />
        <Chip label="From clients" onPress={() => setClientSheet(true)} />
      </View>

      <Field
        label="Billing address"
        value={billingAddress}
        onChangeText={setBillingAddress}
        multiline
        pasteAccepts={looksLikeAddress}
      />
      <Field
        label="Shipping address"
        hint="Leave empty if it is the same"
        value={shippingAddress}
        onChangeText={setShippingAddress}
        multiline
        pasteAccepts={looksLikeAddress}
      />

      <Text variant="label" tone="muted" style={styles.block}>How is GST quoted?</Text>
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

      <Text variant="label" tone="muted" style={styles.block}>Lines</Text>
      {lines.map((line, index) => {
        const slab = slabs.data?.find((s) => s.id === (line.gstSlabId ?? defaultSlab?.id));
        const gross = (line.quantity || 0) * (line.ratePerUnit || 0);
        const off = (gross * (line.discountPct || 0)) / 100;

        return (
          <Animated.View key={line.key} entering={FadeIn.duration(200)} layout={Layout}>
            <Card tone="dark" style={styles.line}>
              <View style={styles.lineHead}>
                <Text variant="tiny" tone="faint">LINE {index + 1}</Text>
                {lines.length > 1 ? (
                  <Chip
                    label="Remove"
                    onPress={() =>
                      setLines((current) => current.filter((l) => l.key !== line.key))
                    }
                  />
                ) : null}
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
                <Chip label={line.unit ?? 'Sqf'} onPress={() => setUnitFor(line.key)} />
                <Chip
                  label={slab ? `GST ${Number(slab.ratePct)}%` : 'GST'}
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
        icon={<Icon name="plus" size={16} color={palette.text} />}
        onPress={() => setLines((current) => [...current, blankLine()])}
      />

      <Card tone="dark" style={{ marginTop: spacing.lg }}>
        <Text variant="label" tone="muted">Preview</Text>
        <Text variant="tiny" tone="faint" style={{ marginBottom: spacing.sm }}>
          The server prices it for real when you save.
        </Text>
        <Row label="Taxable" value={formatInr(preview.net)} />
        {preview.discount > 0 ? (
          <Row label="Discount" value={formatInr(preview.discount)} />
        ) : null}
        <Row label="GST" value={formatInr(preview.tax)} />
        <Row label="Client pays" value={formatInr(preview.gross)} accent />
      </Card>

      <Field
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        multiline
        containerStyle={{ marginTop: spacing.lg }}
      />

      <Button
        title={estimateId ? 'Save quote' : 'Create quote'}
        size="lg"
        loading={busy}
        disabled={!usable || (!clientId && !clientName.trim())}
        onPress={save}
        style={{ marginTop: spacing.lg }}
      />

      <ContactPickerSheet
        visible={contactSheet}
        onClose={() => setContactSheet(false)}
        onPick={(contact) => {
          setClientName(contact.name);
          setClientId(undefined);
        }}
      />

      <Sheet
        visible={clientSheet}
        title="Pick a client"
        onClose={() => setClientSheet(false)}
        fullHeight>
        <Field
          placeholder="Name or phone"
          value={clientSearch}
          onChangeText={setClientSearch}
          icon="search"
          pasteable={false}
        />
        {(clients.data?.data ?? []).map((client) => (
          <SheetOption
            key={client.id}
            label={client.name}
            description={[client.code, client.phone].filter(Boolean).join(' · ')}
            selected={clientId === client.id}
            onPress={() => {
              setClientId(client.id);
              setClientName(client.name);
              setBillingAddress(client.billingAddress ?? client.address ?? '');
              setShippingAddress(client.shippingAddress ?? '');
              setClientSheet(false);
            }}
          />
        ))}
      </Sheet>

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

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
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
  block: { marginTop: spacing.lg, marginBottom: spacing.sm },
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

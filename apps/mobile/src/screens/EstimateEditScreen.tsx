import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type {
  Estimate,
  EstimateItemInput,
  GstSlab,
  TaxTreatment,
} from '@fas/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { ContactPickerSheet } from '../components/ContactPickerSheet';
import {
  ClientPicker,
  clientRef,
  hasClient,
  pickedClient,
  typedClient,
  type ClientChoice,
} from '../components/ClientPicker';
import { looksLikeAddress } from '../hooks/useClipboardSuggestion';
import {
  PricedLines,
  blankLine,
  usableLines,
  type PricedLine as Line,
} from '../components/PricedLines';
import {
  Button,
  Chip,
  Field,
  Loader,
  Screen,
  ScreenHeader,
  Text,
  haptic,
} from '../ui';
import { spacing } from '../theme';

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
      /** What the enquiry was already priced at, where it was priced. */
      items?: EstimateItemInput[];
      taxTreatment?: TaxTreatment;
    };
  };

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
  const [treatment, setTreatment] = useState<TaxTreatment>(lead?.taxTreatment ?? 'EXCLUSIVE');
  const [notes, setNotes] = useState(lead ? `For enquiry ${lead.code}` : '');
  /*
   * An enquiry that was already priced hands its lines over whole, because
   * re-keying a rate the client has already been told is how the quote ends
   * up disagreeing with the conversation. Where it was not priced, its title
   * seeds the first line, which is what the screen always did.
   */
  const [lines, setLines] = useState<Line[]>(() =>
    lead?.items?.length
      ? lead.items.map((item, index) => ({ ...item, key: `lead-${index}` }))
      : [lead?.title ? { ...blankLine(), name: lead.title } : blankLine()],
  );

  const [contactSheet, setContactSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    const data = existing.data;
    if (!data) return;
    setClient(
      data.client
        ? pickedClient(data.client)
        : typedClient(data.clientName ?? ''),
    );
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

  const usable = usableLines(lines).length > 0;

  return (
    <Screen>
      <ScreenHeader
        title={estimateId ? 'Edit quote' : 'New quote'}
        subtitle={existing.data?.code}
        onBack={() => navigation.goBack()}
      />

      <Text variant="label" tone="muted" style={styles.block}>Who is it for?</Text>
      <ClientPicker
        value={client}
        onChange={setClient}
        namePlaceholder="Who is this quote for?"
        onPick={(picked) => {
          setBillingAddress(picked.billingAddress ?? picked.address ?? '');
          setShippingAddress(picked.shippingAddress ?? '');
        }}
      />
      {client.client ? null : (
        <View style={styles.chipWrap}>
          <Chip label="From contacts" onPress={() => setContactSheet(true)} />
        </View>
      )}

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

      <Text variant="label" tone="muted" style={styles.block}>Lines</Text>
      <PricedLines
        lines={lines}
        onChange={setLines}
        treatment={treatment}
        onTreatmentChange={setTreatment}
        slabs={slabs.data ?? undefined}
      />

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
        disabled={!usable || !hasClient(client)}
        onPress={save}
        style={{ marginTop: spacing.lg }}
      />

      <ContactPickerSheet
        visible={contactSheet}
        onClose={() => setContactSheet(false)}
        onPick={(contact) => {
          // A name off the phone is a client who is not on file yet, so it
          // fills the new-client half rather than pretending to be a record.
          setClient(typedClient(contact.name, contact.phone ?? ''));
        }}
      />

    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.lg, marginBottom: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
});

import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type { Client } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { ContactPickerSheet } from '../components/ContactPickerSheet';
import {
  looksLikeAddress,
  looksLikeGstin,
  looksLikePhone,
} from '../hooks/useClipboardSuggestion';
import {
  Button,
  Chip,
  Field,
  Loader,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
  haptic,
} from '../ui';
import { spacing } from '../theme';

/**
 * A client's firm details.
 *
 * Everything here except the name is optional: an order gets punched off a
 * phone call, and the GSTIN and the billing address turn up later when someone
 * asks for a bill. They live here rather than on the punch form so filling them
 * in never blocks the floor.
 */
export function ClientFirmScreen({ route, navigation }: { route: any; navigation: any }) {
  const { clientId } = route.params as { clientId: string };
  const client = useApi<Client>(() => api.client(clientId), [clientId]);

  const [form, setForm] = useState<Partial<Client>>({});
  const [busy, setBusy] = useState(false);
  const [contactSheet, setContactSheet] = useState(false);

  useEffect(() => {
    if (client.data) setForm(client.data);
  }, [client.data]);

  const set = (key: keyof Client) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setBusy(true);
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
      haptic('notificationSuccess');
      client.reload();
      navigation.goBack();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!client.data) return <Loader label="Loading" />;

  return (
    <Screen>
      <ScreenHeader
        title="Firm details"
        subtitle={client.data.name}
        onBack={() => navigation.goBack()}
      />

      <SectionHeader title="Who they are" />
      <Field label="Contact name" value={form.name ?? ''} onChangeText={set('name')} />
      <Field
        label="Firm name"
        hint="The trading name on their paperwork"
        value={form.company ?? ''}
        onChangeText={set('company')}
      />
      <Field
        label="GST number"
        placeholder="08AAWFD7264P1ZC"
        value={form.gstin ?? ''}
        onChangeText={set('gstin')}
        autoCapitalize="characters"
        pasteAccepts={looksLikeGstin}
      />
      <View style={styles.row}>
        <Field
          label="State code"
          placeholder="08"
          value={form.stateCode ?? ''}
          onChangeText={set('stateCode')}
          keyboardType="number-pad"
          containerStyle={{ flex: 1 }}
        />
        <Field
          label="State"
          value={form.stateName ?? ''}
          onChangeText={set('stateName')}
          containerStyle={{ flex: 2 }}
        />
      </View>
      <Text variant="tiny" tone="faint" style={styles.note}>
        Their state against yours decides whether their bill shows CGST and SGST
        or a single IGST line.
      </Text>

      <SectionHeader title="How to reach them" />
      <View style={styles.chipWrap}>
        <Chip label="Fill from contacts" onPress={() => setContactSheet(true)} />
      </View>
      <Field
        label="Phone"
        value={form.phone ?? ''}
        onChangeText={set('phone')}
        keyboardType="phone-pad"
        pasteAccepts={looksLikePhone}
      />
      <Field
        label="Alternate number"
        hint="The site contact, usually"
        value={form.altPhone ?? ''}
        onChangeText={set('altPhone')}
        keyboardType="phone-pad"
        pasteAccepts={looksLikePhone}
      />
      <Field
        label="Email"
        value={form.email ?? ''}
        onChangeText={set('email')}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <SectionHeader title="Addresses" />
      <Field
        label="Billing address"
        hint="Printed on estimates and bills"
        value={form.billingAddress ?? ''}
        onChangeText={set('billingAddress')}
        multiline
        pasteAccepts={looksLikeAddress}
      />
      <Field
        label="Shipping address"
        hint="Leave empty if the same as billing"
        value={form.shippingAddress ?? ''}
        onChangeText={set('shippingAddress')}
        multiline
        pasteAccepts={looksLikeAddress}
      />
      <Field
        label="Other address"
        value={form.address ?? ''}
        onChangeText={set('address')}
        multiline
        pasteAccepts={looksLikeAddress}
      />

      <SectionHeader title="Notes" />
      <Field value={form.notes ?? ''} onChangeText={set('notes')} multiline />

      <Button
        title="Save"
        size="lg"
        loading={busy}
        onPress={save}
        style={{ marginTop: spacing.lg }}
      />

      <ContactPickerSheet
        visible={contactSheet}
        onClose={() => setContactSheet(false)}
        onPick={(contact) =>
          setForm((current) => ({
            ...current,
            // Only fills what is empty: a contact card must not overwrite a
            // number somebody has deliberately corrected here.
            name: current.name || contact.name,
            phone: current.phone || contact.phone,
            email: current.email || contact.email,
            company: current.company || contact.company,
          }))
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  note: { marginTop: -spacing.sm, marginBottom: spacing.md, lineHeight: 16 },
  chipWrap: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
});

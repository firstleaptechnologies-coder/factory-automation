import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { duplicateClientFrom } from '@fas/shared';
import { api } from '../api/client';
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
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
  haptic,
} from '../ui';
import { spacing } from '../theme';

/**
 * Adding a client, on purpose.
 *
 * Until now a client could only appear as a side effect of punching an order
 * or writing a quote — which is fine for the floor, and no use at all to an
 * owner who has just been given a firm's card and wants them on file before
 * any work exists. So the Clients screen can open this directly.
 *
 * Two ways in, because a shop has both: the phone's address book for somebody
 * who has already rung, and the keyboard for somebody who hasn't. Contacts is
 * offered first and is never required — permission refused, or no matching
 * contact, leaves a form that was always going to work on its own.
 *
 * Only the name is required. Everything else can be filled in from the firm
 * details screen later, and making a GSTIN a condition of writing a name down
 * is how clients end up scribbled on the back of a job card instead.
 */
export function ClientNewScreen({ route, navigation }: { route?: any; navigation: any }) {
  // Opened from a search that found nobody: the term that was typed is far
  // more often the client's name than not, so it starts the form off.
  const suggestedName = (route?.params?.name as string | undefined) ?? '';

  const [form, setForm] = useState({
    name: suggestedName,
    phone: '',
    company: '',
    email: '',
    gstin: '',
    billingAddress: '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [contactSheet, setContactSheet] = useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const trimmed = (value: string) => value.trim() || undefined;
  const named = form.name.trim().length >= 2;

  const save = async () => {
    if (!named) return;
    setBusy(true);
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
      haptic('notificationSuccess');
      // Replaced, not pushed: going back from the new client should reach the
      // list it was added to, not the empty form it was added on.
      navigation.replace('ClientDetail', { clientId: client.id });
    } catch (e) {
      haptic('notificationError');

      /*
       * The server refuses a second client on a number another client already
       * has, because that is a firm's ledger split in two. It names the one
       * that exists — which is almost certainly the client being looked for,
       * so offer to open it rather than making somebody go and search.
       */
      const existing = duplicateClientFrom(e);
      if (existing) {
        Alert.alert(
          'Already on file',
          `${existing.name} (${existing.code}) has this number.`,
          [
            { text: 'Change the number', style: 'cancel' },
            {
              text: `Open ${existing.name}`,
              onPress: () => navigation.replace('ClientDetail', { clientId: existing.id }),
            },
          ],
        );
        return;
      }

      Alert.alert('Could not add', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="New client"
        subtitle="Only the name is needed"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.chipWrap}>
        <Chip
          label="Add from contacts"
          onPress={() => setContactSheet(true)}
          testID="from-contacts"
        />
      </View>

      <SectionHeader title="Who they are" />
      <Field
        label="Name"
        placeholder="Who the work is for"
        value={form.name}
        onChangeText={set('name')}
        icon="user"
        autoFocus={!suggestedName}
      />
      <Field
        label="Firm name"
        hint="The trading name on their paperwork, if it differs"
        value={form.company}
        onChangeText={set('company')}
      />

      <SectionHeader title="How to reach them" />
      <Field
        label="Phone"
        placeholder="Optional, but it is what they are found by"
        value={form.phone}
        onChangeText={set('phone')}
        keyboardType="phone-pad"
        icon="phone"
        pasteAccepts={looksLikePhone}
        hint="If this number is already on file, you will be shown that client."
      />
      <Field
        label="Email"
        value={form.email}
        onChangeText={set('email')}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <SectionHeader title="For their bills" />
      <Field
        label="GST number"
        placeholder="08AAWFD7264P1ZC"
        value={form.gstin}
        onChangeText={set('gstin')}
        autoCapitalize="characters"
        pasteAccepts={looksLikeGstin}
      />
      <Field
        label="Billing address"
        value={form.billingAddress}
        onChangeText={set('billingAddress')}
        multiline
        pasteAccepts={looksLikeAddress}
      />
      <Text variant="tiny" tone="faint" style={styles.note}>
        Their state decides whether a bill shows CGST and SGST or a single IGST
        line. Add it under Firm details once you have their GST number.
      </Text>

      <SectionHeader title="Notes" />
      <Field
        value={form.notes}
        onChangeText={set('notes')}
        placeholder="Anything worth remembering — who to ask for, how they pay"
        multiline
      />

      <Button
        title="Add client"
        size="lg"
        loading={busy}
        disabled={!named}
        onPress={save}
        testID="save-client"
        style={{ marginTop: spacing.lg }}
      />

      <ContactPickerSheet
        visible={contactSheet}
        onClose={() => setContactSheet(false)}
        title="Add from contacts"
        onPick={(contact) =>
          setForm((current) => ({
            ...current,
            // Fills only what is still empty, so a contact card cannot write
            // over a number somebody has deliberately corrected here.
            name: current.name || contact.name,
            phone: current.phone || contact.phone || '',
            email: current.email || contact.email || '',
            company: current.company || contact.company || '',
          }))
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipWrap: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  note: { marginTop: -spacing.sm, marginBottom: spacing.md, lineHeight: 16 },
});

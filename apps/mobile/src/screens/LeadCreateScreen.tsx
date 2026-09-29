import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { CustomFieldDefinition, LeadSource } from '@fas/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { CustomFieldInputs } from '../components/CustomFieldInputs';
import { ContactPickerSheet } from '../components/ContactPickerSheet';
import { looksLikeAddress } from '../hooks/useClipboardSuggestion';
import {
  PricedLines,
  blankLine,
  usableLines,
  type PricedLine,
} from '../components/PricedLines';
import {
  Button,
  Chip,
  Field,
  Icon,
  Loader,
  Screen,
  ScreenHeader,
  Text,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';

/**
 * New enquiry.
 *
 * Shaped like the quote form, because the shop asks the same questions on the
 * same call — who it is for, where a bill would go, and what they want — and
 * everything typed here carries into the quotation rather than being asked
 * for twice.
 *
 * Three differences from the quote, and each is deliberate:
 *
 *   **A name and a number are required.** Everything else on an enquiry can
 *   wait, but an enquiry nobody can ring back is a note, not a lead — it is
 *   the one field that decides whether the shop ever hears from them again.
 *
 *   **No GST.** An enquiry is not a tax document and must not look like one:
 *   a priced sheet carrying a GST column reads as a bill to whoever is handed
 *   it. The tax is worked out on the quotation, where somebody is actually
 *   being asked to pay.
 *
 *   **No estimated total.** Estimating is what the quote is for. This is the
 *   enquiry and what was asked for, and the lines carry a rate only if
 *   somebody happens to know one.
 */
export function LeadCreateScreen({ navigation }: { navigation: any }) {
  const sources = useApi<LeadSource[]>(() => api.leadSources(), []);
  const fields = useApi<CustomFieldDefinition[]>(() => api.leadFields(), []);

  const [title, setTitle] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const [contactSheet, setContactSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  const [lines, setLines] = useState<PricedLine[]>([]);

  const named = usableLines(lines);
  const reachable = Boolean(contactName.trim() && contactPhone.trim());

  const submit = async () => {
    setBusy(true);
    try {
      const lead = await api.createLead({
        title: title.trim(),
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        company: company.trim() || undefined,
        location: location.trim() || undefined,
        billingAddress: billingAddress.trim() || undefined,
        shippingAddress: shippingAddress.trim() || undefined,
        sourceId: sourceId ?? undefined,
        // Left out entirely when nothing was listed, rather than sent empty:
        // an enquiry with no lines is ordinary, not a cleared one.
        ...(named.length
          ? {
              items: named.map(({ key: _key, ...line }) => ({
                name: line.name.trim(),
                description: line.description?.trim() || undefined,
                unit: line.unit,
                quantity: line.quantity || undefined,
                ratePerUnit: line.ratePerUnit || undefined,
                discountPct: line.discountPct || undefined,
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
        <Text variant="label" tone="muted" style={styles.label}>Who is it for?</Text>
        <Field
          label="Client name"
          placeholder="Who rang?"
          value={contactName}
          onChangeText={setContactName}
          icon="user"
        />
        <Field
          label="Phone"
          placeholder="The number to ring back on"
          value={contactPhone}
          onChangeText={setContactPhone}
          keyboardType="phone-pad"
          icon="phone"
        />
        <View style={styles.chipWrap}>
          <Chip
            label="From contacts"
            testID="from-contacts"
            onPress={() => setContactSheet(true)}
          />
        </View>

        <Field label="Company" value={company} onChangeText={setCompany} />

        <Field
          label="Billing address"
          hint="Optional — asked again on the quote if it is not known yet"
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

        <Text variant="label" tone="muted" style={styles.label}>What is it for?</Text>
        <Field
          label="Enquiry"
          placeholder="e.g. Marble kitchen counters"
          value={title}
          onChangeText={setTitle}
          icon="tag"
        />
        <Field label="Site location" value={location} onChangeText={setLocation} icon="pin" />

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
          Closed until asked for. Plenty of enquiries are one line said on the
          phone, and a form that opens with an empty item table reads as one
          demanding a specification.
        */}
        <Text variant="h3" style={styles.section}>Items</Text>
        {lines.length === 0 ? (
          <>
            <Text variant="tiny" tone="faint" style={styles.blurb}>
              What they asked for. A rate is optional — put one in if you know
              it, and it carries into the quote.
            </Text>
            <Button
              title="Add items"
              variant="dark"
              testID="start-items"
              icon={<Icon name="plus" size={16} color={palette.text} />}
              onPress={() => setLines([blankLine()])}
            />
          </>
        ) : (
          <PricedLines
            lines={lines}
            onChange={setLines}
            /* Unused without tax, but the editor is shared with the quote. */
            treatment="EXCLUSIVE"
            onTreatmentChange={() => undefined}
            tax={false}
            allowEmpty
            placeholder="MDF jali, laser cut"
          />
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
          /* A name and a number, or there is nobody to ring back. */
          disabled={!reachable || !title.trim()}
          onPress={submit}
          style={{ marginTop: spacing.lg }}
        />
      </Animated.View>

      <ContactPickerSheet
        visible={contactSheet}
        onClose={() => setContactSheet(false)}
        onPick={(contact) => {
          setContactName(contact.name);
          if (contact.phone) setContactPhone(contact.phone);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: spacing.lg, marginBottom: spacing.sm },
  blurb: { marginBottom: spacing.md, lineHeight: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  section: { marginTop: spacing.xl, marginBottom: spacing.sm },
});

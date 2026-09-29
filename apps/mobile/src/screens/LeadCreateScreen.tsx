import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type {
  CustomFieldDefinition,
  GstSlab,
  LeadSource,
  TaxTreatment,
} from '@fas/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { CustomFieldInputs } from '../components/CustomFieldInputs';
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
 * Two halves, and the split is deliberate. The top is what an enquiry has
 * always needed — who rang, what about, where — and it stays as cheap as it
 * was: a title and a way to reach somebody is enough, because an enquiry that
 * takes five minutes to log is an enquiry nobody logs.
 *
 * Under it is the pricing, in exactly the shape a quotation takes it, because
 * it is the same editor. Not the punch form's materials and sizes: an enquiry
 * is priced before anything has been measured, which is the same reason
 * Quotes does not use it either. It is closed until asked for, so the common
 * case is untouched, and what is typed here carries straight into the quote
 * rather than being keyed a second time.
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

  const [treatment, setTreatment] = useState<TaxTreatment>('EXCLUSIVE');
  const [lines, setLines] = useState<PricedLine[]>([]);

  const defaultSlab = slabs.data?.find((slab) => slab.isDefault) ?? slabs.data?.[0];
  const usable = usableLines(lines);

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
        {lines.length === 0 ? (
          <>
            <Text variant="tiny" tone="faint" style={styles.blurb}>
              Optional. Priced here, it carries straight into the quote.
            </Text>
            <Button
              title="Price this enquiry"
              variant="dark"
              testID="start-pricing"
              icon={<Icon name="plus" size={16} color={palette.text} />}
              onPress={() => setLines([blankLine()])}
            />
          </>
        ) : (
          <PricedLines
            lines={lines}
            onChange={setLines}
            treatment={treatment}
            onTreatmentChange={setTreatment}
            slabs={slabs.data ?? undefined}
            /* An enquiry can go back to having no price at all. */
            allowEmpty
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
          disabled={!title.trim()}
          onPress={submit}
          style={{ marginTop: spacing.lg }}
        />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  blurb: { marginBottom: spacing.md, lineHeight: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  section: { marginTop: spacing.xl, marginBottom: spacing.sm },
});

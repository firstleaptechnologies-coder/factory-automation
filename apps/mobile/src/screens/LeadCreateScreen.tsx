import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { CustomFieldDefinition, LeadSource } from '@fas/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { CustomFieldInputs } from '../components/CustomFieldInputs';
import { Button, Chip, Field, Loader, Screen, ScreenHeader, Text, haptic } from '../ui';
import { spacing } from '../theme';

/** New enquiry. The lower half of this form is whatever the admin defined. */
export function LeadCreateScreen({ navigation }: { navigation: any }) {
  const sources = useApi<LeadSource[]>(() => api.leadSources(), []);
  const fields = useApi<CustomFieldDefinition[]>(() => api.leadFields(), []);

  const [title, setTitle] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [estimatedValue, setEstimatedValue] = useState('');
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);

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
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  section: { marginTop: spacing.xl },
});

import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type { CustomFieldDefinition, CustomFieldType, LeadSource } from '@decor/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import {
  Button,
  Card,
  DataTable,
  Chip,
  Field,
  Icon,
  Loader,
  Screen,
  ScreenHeader,
  SectionHeader,
  Sheet,
  Text,
  haptic,
} from '../../ui';
import { palette, spacing } from '../../theme';

const TYPES: CustomFieldType[] = [
  'TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTI_SELECT', 'PHONE', 'EMAIL',
];

/** What the shop captures on an enquiry, and where enquiries come from. */
export function AdminLeadFieldsScreen({ navigation }: { navigation: any }) {
  const fields = useApi<CustomFieldDefinition[]>(() => api.leadFields(true), []);
  const sources = useApi<LeadSource[]>(() => api.leadSources(true), []);
  const [busy, setBusy] = useState(false);

  const [fieldSheet, setFieldSheet] = useState(false);
  const [form, setForm] = useState({
    label: '',
    type: 'TEXT' as CustomFieldType,
    options: '',
    required: false,
  });

  const [sourceSheet, setSourceSheet] = useState(false);
  const [source, setSource] = useState({ code: '', name: '' });

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      haptic('notificationSuccess');
      fields.reload();
      sources.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const needsOptions = form.type === 'SELECT' || form.type === 'MULTI_SELECT';

  if (!fields.data || !sources.data) return <Loader />;

  return (
    <Screen refreshing={fields.refreshing} onRefresh={fields.refresh}>
      <ScreenHeader title="Lead capture" onBack={() => navigation.goBack()} />

      <Text variant="tiny" tone="faint" style={styles.hint}>
        The lead form builds itself from these. Removing a field hides it but keeps what
        was already captured.
      </Text>

      <Button
        title="Add field"
        icon={<Icon name="plus" size={17} color={palette.textOnAccent} />}
        onPress={() => setFieldSheet(true)}
      />

      <SectionHeader title="Fields" />
      <Card tone="dark" style={{ marginBottom: spacing.md }}>
        <DataTable
          minWidth={520}
          rows={fields.data}
          empty="No custom fields yet"
          columns={[
            {
              key: 'label',
              header: 'Field',
              flex: 2,
              render: (field) => (
                <>
                  <Text variant="small" bold numberOfLines={1}>
                    {field.label}
                    {field.required ? ' *' : ''}
                  </Text>
                  <Text variant="tiny" tone="faint" numberOfLines={1}>
                    {field.key}
                  </Text>
                </>
              ),
            },
            {
              key: 'type',
              header: 'Type',
              flex: 1.1,
              render: (field) => (
                <Text variant="tiny" tone="muted">
                  {field.type.replace('_', ' ').toLowerCase()}
                </Text>
              ),
            },
            {
              key: 'options',
              header: 'Options',
              flex: 1.8,
              render: (field) => (
                <Text variant="tiny" tone="muted" numberOfLines={2}>
                  {field.options.length ? field.options.join(', ') : '—'}
                </Text>
              ),
            },
            {
              key: 'action',
              header: '',
              flex: 1.1,
              align: 'right',
              render: (field) => (
                <Chip
                  label={field.isActive ? 'Hide' : 'Restore'}
                  onPress={() =>
                    run(() =>
                      field.isActive
                        ? api.deactivateLeadField(field.id)
                        : api.updateLeadField(field.id, { isActive: true }),
                    )
                  }
                />
              ),
            },
          ]}
        />
      </Card>

      <SectionHeader title="Sources" actionLabel="Add" onAction={() => setSourceSheet(true)} />
      <View style={styles.chipWrap}>
        {sources.data.map((s) => (
          <Chip key={s.id} label={s.name} accent={s.color} selected onPress={() => {}} />
        ))}
      </View>

      <Sheet visible={fieldSheet} title="Add a lead field" onClose={() => setFieldSheet(false)}>
        <Field
          label="Label"
          placeholder="e.g. Architect"
          value={form.label}
          onChangeText={(v) => setForm({ ...form, label: v })}
          hint="The key is generated from this."
        />

        <Text variant="label" tone="muted" style={styles.sheetLabel}>Type</Text>
        <View style={styles.chipWrap}>
          {TYPES.map((type) => (
            <Chip
              key={type}
              label={type.replace('_', ' ').toLowerCase()}
              selected={form.type === type}
              onPress={() => setForm({ ...form, type })}
            />
          ))}
        </View>

        {needsOptions ? (
          <Field
            label="Options"
            placeholder="Under 1L, 1-5L, 5-10L"
            value={form.options}
            onChangeText={(v) => setForm({ ...form, options: v })}
            hint="Comma separated"
            containerStyle={{ marginTop: spacing.lg }}
          />
        ) : null}

        <Text variant="label" tone="muted" style={styles.sheetLabel}>Required</Text>
        <View style={styles.chipWrap}>
          <Chip label="No" selected={!form.required} onPress={() => setForm({ ...form, required: false })} />
          <Chip label="Yes" selected={form.required} onPress={() => setForm({ ...form, required: true })} />
        </View>

        <Button
          title="Add field"
          loading={busy}
          disabled={!form.label.trim() || (needsOptions && !form.options.trim())}
          onPress={() =>
            run(async () => {
              await api.createLeadField({
                key: form.label,
                label: form.label.trim(),
                type: form.type,
                options: needsOptions
                  ? form.options.split(',').map((o) => o.trim()).filter(Boolean)
                  : [],
                required: form.required,
                sortOrder: fields.data!.length,
              });
              setForm({ label: '', type: 'TEXT', options: '', required: false });
              setFieldSheet(false);
            })
          }
          style={{ marginTop: spacing.xl }}
        />
      </Sheet>

      <Sheet visible={sourceSheet} title="Add a source" onClose={() => setSourceSheet(false)}>
        <Field
          label="Code"
          placeholder="INSTAGRAM"
          value={source.code}
          onChangeText={(v) => setSource({ ...source, code: v.toUpperCase().replace(/\s+/g, '_') })}
        />
        <Field
          label="Name"
          placeholder="Instagram"
          value={source.name}
          onChangeText={(v) => setSource({ ...source, name: v })}
        />
        <Button
          title="Add source"
          loading={busy}
          disabled={!source.code.trim() || !source.name.trim()}
          onPress={() =>
            run(async () => {
              await api.createLeadSource(source);
              setSource({ code: '', name: '' });
              setSourceSheet(false);
            })
          }
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, padding: spacing.md },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sheetLabel: { marginTop: spacing.lg, marginBottom: spacing.sm },
});

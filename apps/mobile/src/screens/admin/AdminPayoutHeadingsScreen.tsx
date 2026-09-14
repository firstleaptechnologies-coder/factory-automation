import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { DisbursementCategory } from '@fas/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import {
  Button,
  Card,
  Chip,
  Field,
  Icon,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
  haptic,
} from '../../ui';
import { palette, spacing } from '../../theme';

const BLANK = { code: '', name: '', isActive: true };

/**
 * What a payout is filed under — fitting, transport, polishing.
 *
 * Nothing could create one. The API has always taken them and the payout sheet
 * has always offered them, but the only way a workspace ever got any was the
 * seeding that runs when it is first provisioned. A shop that was never seeded
 * saw an empty "What for?" on every payout and a ledger reading
 * "Uncategorised" for ever, with nothing anywhere to fix it.
 *
 * A heading is never deleted, only taken out of use: every payout already
 * filed under one points at it, and the ledger has to keep saying what those
 * were for.
 */
export function AdminPayoutHeadingsScreen({ navigation }: { navigation: any }) {
  const headings = useApi<DisbursementCategory[]>(
    () => api.disbursementCategories(true),
    [],
  );
  const [editing, setEditing] = useState<DisbursementCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  const usable = editing
    ? Boolean(form.name.trim())
    : Boolean(form.code.trim()) && Boolean(form.name.trim());

  const openNew = () => {
    setForm(BLANK);
    setCreating(true);
  };

  const openEdit = (heading: DisbursementCategory) => {
    setForm({ code: heading.code, name: heading.name, isActive: heading.isActive });
    setEditing(heading);
  };

  const close = () => {
    setEditing(null);
    setCreating(false);
    setForm(BLANK);
  };

  const save = async () => {
    if (!usable) return;
    setBusy(true);
    try {
      if (editing) {
        await api.updateDisbursementCategory(editing.id, {
          name: form.name.trim(),
          isActive: form.isActive,
        });
      } else {
        await api.createDisbursementCategory({
          code: form.code.trim(),
          name: form.name.trim(),
        });
      }
      haptic('notificationSuccess');
      close();
      headings.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!headings.data) return <Loader />;

  const rows = headings.data;
  const inUse = rows.filter((row) => row.isActive);

  return (
    <Screen refreshing={headings.refreshing} onRefresh={headings.refresh}>
      <ScreenHeader
        title="Payout headings"
        subtitle={`${inUse.length} in use`}
        onBack={() => navigation.goBack()}
      />

      {/*
        An empty list is not a tidy list — it is a ledger that cannot say what
        any of the money went on.
      */}
      {rows.length === 0 ? (
        <Card tone="dark" style={styles.warn}>
          <Text variant="body" bold style={styles.warnTitle} testID="no-headings">
            No headings yet
          </Text>
          <Text variant="small" tone="muted" style={{ marginTop: spacing.xs }}>
            Until one exists, every payout is filed as Uncategorised and the ledger
            cannot tell you what the money went on. Most shops here start with
            Fitting, Transport and Polishing.
          </Text>
        </Card>
      ) : null}

      <Button
        title="Add a heading"
        icon={<Icon name="plus" size={17} color={palette.textOnAccent} />}
        onPress={openNew}
        style={{ marginBottom: spacing.lg }}
      />

      {rows.map((heading, index) => (
        <Animated.View key={heading.id} entering={FadeInDown.delay(index * 40).duration(300)}>
          <Card tone="dark" style={styles.card} onPress={() => openEdit(heading)}>
            <View style={{ flex: 1 }}>
              <Text variant="h3">{heading.name}</Text>
              <Text variant="tiny" tone="muted">{heading.code}</Text>
            </View>
            {heading.isActive ? null : (
              <Pill label="Not offered" color={palette.textFaint} small />
            )}
          </Card>
        </Animated.View>
      ))}

      <Sheet
        visible={creating || Boolean(editing)}
        title={editing ? editing.name : 'Add a heading'}
        subtitle="What the money went on"
        onClose={close}>
        {editing ? null : (
          <Field
            label="Short code"
            placeholder="FITTING"
            value={form.code}
            onChangeText={(code) => setForm((current) => ({ ...current, code: code.toUpperCase() }))}
            hint="Fixed once it is made — the ledger files against it."
          />
        )}
        <Field
          label="Called"
          placeholder="Fitting"
          value={form.name}
          onChangeText={(name) => setForm((current) => ({ ...current, name }))}
        />

        {editing ? (
          <>
            <Chip
              label={form.isActive ? 'Offered on a payout' : 'Not offered'}
              selected={form.isActive}
              testID="toggle-offered"
              onPress={() =>
                setForm((current) => ({ ...current, isActive: !current.isActive }))
              }
            />
            <Text variant="tiny" tone="faint" style={styles.note}>
              Taking one out of use stops it being offered on a new payout. Everything
              already filed under it keeps saying so.
            </Text>
          </>
        ) : null}

        <Button
          title={editing ? 'Save' : 'Add it'}
          loading={busy}
          disabled={!usable}
          onPress={save}
          style={{ marginTop: spacing.lg }}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  warn: { marginBottom: spacing.lg },
  warnTitle: { color: palette.warning },
  card: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  note: { marginTop: spacing.md },
});

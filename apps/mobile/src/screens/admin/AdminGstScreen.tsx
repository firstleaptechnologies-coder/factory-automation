import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { GstSlab } from '@fas/shared';
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

const BLANK = { name: '', ratePct: '', isDefault: false, isActive: true };

/*
 * Every change to this form goes through the updater, never a spread of the
 * `form` the current render closed over.
 *
 * Typing a name and immediately tapping a chip lost the name: the chip's
 * handler had been created a render or two earlier, so it spread a `form`
 * whose `name` was whatever it had been then and wrote that back over the
 * letters since. "GST 18%" was saved as "GS". A fast typist does it by hand;
 * the simulator does it every time.
 */

/**
 * The rates this shop charges.
 *
 * It had no screen at all. The API has always taken slabs — the punch screen
 * and every quote line pick one — but the only way a workspace ever got any
 * was the seeding that runs when it is first provisioned. A shop whose slabs
 * were never seeded, or were removed, could not make one from either client:
 * every line stayed at 0% and a registered dealer's bills went out with no tax
 * on them. Its own trial found it within the hour.
 *
 * Rates can be edited, which is safe: a line snapshots the rate and the tax it
 * came to when it is priced, so nothing already quoted, ordered or invoiced
 * moves underneath the shop. The screen says so, because that is the first
 * thing anybody sensible worries about before touching a tax rate.
 */
export function AdminGstScreen({ navigation }: { navigation: any }) {
  const slabs = useApi<GstSlab[]>(() => api.gstSlabs(true), []);
  const [editing, setEditing] = useState<GstSlab | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  const rate = Number(form.ratePct);
  const usable = Boolean(form.name.trim()) && form.ratePct.trim() !== '' && rate >= 0 && rate <= 100;

  const openNew = () => {
    setForm(BLANK);
    setCreating(true);
  };

  const openEdit = (slab: GstSlab) => {
    setForm({
      name: slab.name,
      ratePct: String(Number(slab.ratePct)),
      isDefault: slab.isDefault,
      isActive: slab.isActive,
    });
    setEditing(slab);
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
        await api.updateGstSlab(editing.id, {
          name: form.name.trim(),
          ratePct: rate,
          isDefault: form.isDefault,
          isActive: form.isActive,
        });
      } else {
        await api.createGstSlab({
          name: form.name.trim(),
          ratePct: rate,
          isDefault: form.isDefault,
        });
      }
      haptic('notificationSuccess');
      close();
      slabs.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!slabs.data) return <Loader />;

  const active = slabs.data.filter((slab) => slab.isActive);

  return (
    <Screen refreshing={slabs.refreshing} onRefresh={slabs.refresh}>
      <ScreenHeader
        title="GST rates"
        subtitle={`${active.length} in use`}
        onBack={() => navigation.goBack()}
      />

      {/*
        An empty list is not a tidy list — it is a shop that cannot raise a
        legal bill. Say what it means rather than showing an elegant nothing.
      */}
      {slabs.data.length === 0 ? (
        <Card tone="dark" style={styles.warn}>
          <Text variant="body" bold style={styles.warnTitle} testID="no-slabs">
            No rates yet
          </Text>
          <Text variant="small" tone="muted" style={{ marginTop: spacing.xs }}>
            Until one exists, every order and quote is priced at 0% and the bills
            you send carry no GST. Most shops here add 18%, 12% and 5%.
          </Text>
        </Card>
      ) : null}

      <Button
        title="Add a rate"
        icon={<Icon name="plus" size={17} color={palette.textOnAccent} />}
        onPress={openNew}
        style={{ marginBottom: spacing.lg }}
      />

      {slabs.data.map((slab, index) => (
        <Animated.View key={slab.id} entering={FadeInDown.delay(index * 40).duration(300)}>
          <Card tone="dark" style={styles.card} onPress={() => openEdit(slab)}>
            <View style={{ flex: 1 }}>
              <Text variant="h3">{slab.name}</Text>
              <View style={styles.pills}>
                {slab.isDefault ? <Pill label="Default" color={palette.accent} small /> : null}
                {slab.isActive ? null : <Pill label="Off" color={palette.textFaint} small />}
              </View>
            </View>
            <Text variant="h2" tone="accent">{Number(slab.ratePct)}%</Text>
          </Card>
        </Animated.View>
      ))}

      <Sheet
        visible={creating || Boolean(editing)}
        title={editing ? editing.name : 'Add a rate'}
        subtitle="What you charge, and what it is called on the bill"
        onClose={close}>
        <Field
          label="Called"
          placeholder="GST 18%"
          value={form.name}
          onChangeText={(name) => setForm((current) => ({ ...current, name }))}
        />
        <Field
          label="Rate (%)"
          placeholder="18"
          value={form.ratePct}
          onChangeText={(ratePct) => setForm((current) => ({ ...current, ratePct }))}
          keyboardType="decimal-pad"
          hint="Split into CGST and SGST at home, charged as IGST out of state."
        />

        <View style={styles.toggles}>
          <Chip
            label="Use unless another is picked"
            selected={form.isDefault}
            onPress={() => setForm((current) => ({ ...current, isDefault: !current.isDefault }))}
          />
          {editing ? (
            <Chip
              label={form.isActive ? 'Offered while punching' : 'Not offered'}
              selected={form.isActive}
              onPress={() => setForm((current) => ({ ...current, isActive: !current.isActive }))}
            />
          ) : null}
        </View>

        {/*
          The question anybody asks before changing a tax rate, answered before
          they have to ask it.
        */}
        {editing ? (
          <Text variant="tiny" tone="faint" style={styles.note}>
            Changing this does not touch anything already quoted, ordered or
            invoiced — each line keeps the rate it was priced at.
          </Text>
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
  pills: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  toggles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  note: { marginTop: spacing.md },
});

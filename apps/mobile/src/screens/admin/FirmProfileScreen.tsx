import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import type { FirmProfile } from '@fas/shared';
import { ensureReadable, isReadable } from '@fas/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { looksLikeGstin, looksLikePhone } from '../../hooks/useClipboardSuggestion';
import {
  Button,
  Card,
  ColorPicker,
  Field,
  Icon,
  Loader,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
  haptic,
} from '../../ui';
import { palette, radius, spacing } from '../../theme';
import { useTheme } from '../../theming/ThemeProvider';

/** A starting set. Anything is allowed via the hex field beside them. */
const BRAND_COLOURS = [
  '#FF6B1A',
  '#E4232F',
  '#F2A50C',
  '#2EA043',
  '#2F81F7',
  '#8957E5',
  '#00B3A4',
  '#D6455D',
];

/**
 * The shop's own details, as they appear on anything it prints.
 *
 * Filled in once and then reused: every estimate and every bill is drawn from
 * this, so a firm that moves premises changes it here rather than re-uploading
 * artwork. The uploaded letterhead is honoured where one exists, because most
 * shops already have one they are attached to.
 */
export function FirmProfileScreen({ navigation }: { navigation: any }) {
  const profile = useApi<FirmProfile>(() => api.firmProfile(), []);
  const [form, setForm] = useState<Partial<FirmProfile>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { accent, setAccent } = useTheme();

  useEffect(() => {
    if (profile.data) setForm(profile.data);
  }, [profile.data]);

  const set = (key: keyof FirmProfile) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  /** The nearest shade of what they picked that a label can be read on. */
  const readable = ensureReadable(form.themeAccent ?? accent);

  const save = async () => {
    setBusy(true);
    try {
      await api.saveFirmProfile(form);
      // Repaint straight away rather than on the next launch — a colour you
      // picked and cannot see is indistinguishable from one that failed.
      if (form.themeAccent) await setAccent(form.themeAccent);
      haptic('notificationSuccess');
      profile.reload();
      Alert.alert('Saved', 'Your estimates and bills will use these details.');
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const uploadLetterhead = async () => {
    const picked = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
    const asset = picked.assets?.[0];
    if (!asset?.uri) return;

    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', {
        uri: asset.uri,
        name: asset.fileName ?? 'letterhead.jpg',
        type: asset.type ?? 'image/jpeg',
      } as never);
      await api.uploadLetterhead(body);
      haptic('notificationSuccess');
      profile.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not upload', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setUploading(false);
    }
  };

  if (!profile.data) return <Loader label="Loading your firm" />;

  return (
    <Screen refreshing={profile.refreshing} onRefresh={profile.refresh}>
      <ScreenHeader
        title="Firm details"
        subtitle="Printed on every estimate and bill"
        onBack={() => navigation.goBack()}
      />

      <SectionHeader title="Identity" />
      <Field label="Firm name" value={form.name ?? ''} onChangeText={set('name')} />
      <Field
        label="GSTIN"
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
          placeholder="Rajasthan"
          value={form.stateName ?? ''}
          onChangeText={set('stateName')}
          containerStyle={{ flex: 2 }}
        />
      </View>
      <Text variant="tiny" tone="faint" style={styles.note}>
        Your state decides whether a bill shows CGST and SGST or a single IGST
        line, so it has to match your registration.
      </Text>

      <SectionHeader title="Contact" />
      <Field
        label="Phone"
        value={form.phone ?? ''}
        onChangeText={set('phone')}
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
      <Field
        label="Address"
        value={form.address ?? ''}
        onChangeText={set('address')}
        multiline
      />

      <SectionHeader title="Bank details" />
      <Text variant="tiny" tone="faint" style={styles.note}>
        Printed under the totals, so the client knows where to send the money.
      </Text>
      <Field
        label="Account name"
        value={form.bankAccountName ?? ''}
        onChangeText={set('bankAccountName')}
      />
      <Field
        label="Account number"
        value={form.bankAccountNumber ?? ''}
        onChangeText={set('bankAccountNumber')}
        keyboardType="number-pad"
      />
      <View style={styles.row}>
        <Field
          label="Bank"
          value={form.bankName ?? ''}
          onChangeText={set('bankName')}
          containerStyle={{ flex: 1 }}
        />
        <Field
          label="IFSC"
          value={form.bankIfsc ?? ''}
          onChangeText={set('bankIfsc')}
          autoCapitalize="characters"
          containerStyle={{ flex: 1 }}
        />
      </View>
      <Field label="Branch" value={form.bankBranch ?? ''} onChangeText={set('bankBranch')} />

      <SectionHeader title="Terms & signature" />
      <Field
        label="Terms and conditions"
        hint="One per line. They print as a numbered block."
        value={form.termsAndConditions ?? ''}
        onChangeText={set('termsAndConditions')}
        multiline
        style={{ minHeight: 120 }}
      />
      <Field
        label="Signatory"
        placeholder="Authorized Signatory"
        value={form.signatoryName ?? ''}
        onChangeText={set('signatoryName')}
      />

      <SectionHeader title="Brand colour" />
      <Text variant="tiny" tone="faint" style={styles.note}>
        The accent your app and website are painted in. Everything else on the
        theme is structural — the greys are what make a panel look raised — so
        only this one colour is yours to choose.
      </Text>
      <ColorPicker
        label="The colour itself"
        presets={BRAND_COLOURS}
        value={form.themeAccent ?? accent}
        onChange={(colour) => setForm((current) => ({ ...current, themeAccent: colour }))}
      />

      {/*
        A colour nobody can read a button label on is worth saying out loud
        rather than silently correcting: the shop chose it, and the answer is
        theirs to accept.
      */}
      {!isReadable(form.themeAccent ?? accent) ? (
        <Card tone="dark" style={styles.warn}>
          <Text variant="small" tone="warning" bold>
            Labels will be hard to read on this
          </Text>
          <Text variant="tiny" tone="muted" style={{ marginTop: 2 }}>
            Neither white nor charcoal stands out on it. {readable} is the
            nearest shade that works.
          </Text>
          <Button
            title={`Use ${readable}`}
            variant="dark"
            size="sm"
            style={{ marginTop: spacing.sm }}
            onPress={() => setForm((current) => ({ ...current, themeAccent: readable }))}
          />
        </Card>
      ) : null}

      <SectionHeader title="Letterhead" />
      <Card tone="dark">
        <Text variant="small" tone="muted">
          {profile.data.letterheadFileId
            ? 'A letterhead is set. Documents are drawn on top of it.'
            : 'No letterhead yet. Documents print with a header built from the details above.'}
        </Text>
        <View style={styles.letterheadRow}>
          <Button
            title={profile.data.letterheadFileId ? 'Replace' : 'Upload'}
            variant="dark"
            size="sm"
            loading={uploading}
            icon={<Icon name="image" size={16} color={palette.text} />}
            onPress={uploadLetterhead}
            style={{ flex: 1 }}
          />
          {profile.data.letterheadFileId ? (
            <Button
              title="Remove"
              variant="ghost"
              size="sm"
              onPress={async () => {
                await api.clearLetterhead();
                profile.reload();
              }}
              style={{ flex: 1 }}
            />
          ) : null}
        </View>
      </Card>

      <Button
        title="Save firm details"
        size="lg"
        loading={busy}
        onPress={save}
        style={{ marginTop: spacing.xl }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  note: { marginTop: -spacing.sm, marginBottom: spacing.md, lineHeight: 16 },
  letterheadRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  warn: { marginTop: spacing.md },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchOn: {
    borderWidth: 2.5,
    borderColor: palette.white,
  },
});

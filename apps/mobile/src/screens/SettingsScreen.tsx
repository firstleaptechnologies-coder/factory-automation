import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { LENGTH_UNITS, UNIT_LABEL } from '@fas/shared';
import { useAuth } from '../auth/AuthContext';
import { useDisplayUnit } from '../hooks/useUnit';
import { API_BASE_URL } from '../api/client';
import {
  marketingVersion,
  nativeBuildNumber,
  otaBuildNumber,
  runtimeVersion,
  versionLabel,
} from '../lib/appVersion';
import { roleLabel, whoLabel } from '../lib/format';
import {
  Avatar,
  Button,
  Card,
  Chip,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
} from '../ui';
import { spacing } from '../theme';

export function SettingsScreen({ navigation }: { navigation: any }) {
  const { user, signOut } = useAuth();
  const [unit, setUnit] = useDisplayUnit();

  return (
    <Screen>
      <ScreenHeader title="Settings" onBack={() => navigation.goBack()} />

      <Card tone="accent" style={styles.profile}>
        <Avatar name={user?.name} size={54} tone="dark" />
        <View style={{ flex: 1, marginLeft: spacing.lg }}>
          <Text variant="h2" tone="onAccent">{user?.name}</Text>
          <Text variant="small" tone="onAccent" style={{ opacity: 0.75 }}>
            {whoLabel(user)}
          </Text>
        </View>
      </Card>

      <SectionHeader title="Display" />
      <Card tone="dark">
        <Text variant="small" tone="muted" style={{ marginBottom: spacing.md }}>
          Sizes are always stored in millimetres. This only changes what you see.
        </Text>
        <View style={styles.chipWrap}>
          {LENGTH_UNITS.map((u) => (
            <Chip key={u} label={UNIT_LABEL[u]} selected={unit === u} onPress={() => setUnit(u)} />
          ))}
        </View>
      </Card>

      <SectionHeader title="About" />
      <Card tone="dark">
        {/*
          Which build this is, in the words the release console uses — so
          somebody on the floor can say "OTA 7" down the phone instead of
          describing what they see.
        */}
        <Row label="Version" value={marketingVersion()} />
        <Row label="Store build" value={String(nativeBuildNumber())} />
        <Row
          label="Update"
          value={otaBuildNumber() === 0 ? 'none taken' : `OTA ${otaBuildNumber()}`}
        />
        <Row label="Runtime" value={runtimeVersion()} />
        <Row label="Server" value={serverLabel()} />
        <Row label="Signed in as" value={user?.code ?? '—'} />
        <Row label="Role" value={roleLabel(user) ?? '—'} />
      </Card>

      <Button
        title="Sign out"
        variant="danger"
        onPress={() =>
          Alert.alert('Sign out?', 'You will need your code and password again.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: signOut },
          ])
        }
        style={{ marginTop: spacing.xl }}
      />

      {/*
        The same four numbers again, on one line at the very bottom.

        Not a duplicate for its own sake: this is the line somebody reads out
        down a phone when a shop says the app is doing the wrong thing, and it
        is where every app puts it, so it is where people look. The rows above
        are for reading; this is for quoting.
      */}
      <Text
        variant="tiny"
        tone="faint"
        testID="version-footer"
        style={styles.versionFooter}>
        {versionLabel()}
      </Text>
    </Screen>
  );
}

/**
 * The API's host, without the path the client appends.
 *
 * Anchored to the end: a plain `replace('/api', '')` takes the *first* match
 * anywhere, so an API served from `https://api.example.com/api` — which is
 * what it will be called — came out as `https:/.example.com/api`. This row
 * exists to be read down a phone when a shop asks which server it is on.
 */
export function serverLabel(url: string = API_BASE_URL): string {
  return url.replace(/\/api\/?$/, '');
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="small" tone="muted">{label}</Text>
      <Text variant="small" bold style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  versionFooter: { textAlign: 'center', marginTop: spacing.xl },
  profile: { flexDirection: 'row', alignItems: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
});

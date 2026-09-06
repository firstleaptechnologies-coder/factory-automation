import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { LENGTH_UNITS, UNIT_LABEL } from '@decor/shared';
import { useAuth } from '../auth/AuthContext';
import { useDisplayUnit } from '../hooks/useUnit';
import { API_BASE_URL } from '../api/client';
import {
  Avatar,
  Button,
  Card,
  Chip,
  Icon,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
} from '../ui';
import { palette, spacing } from '../theme';

export function SettingsScreen({ navigation }: { navigation: any }) {
  const { user, signOut } = useAuth();
  const [unit, setUnit] = useDisplayUnit();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <Screen>
      <ScreenHeader title="Settings" onBack={() => navigation.goBack()} />

      <Card tone="accent" style={styles.profile}>
        <Avatar name={user?.name} size={54} tone="dark" />
        <View style={{ flex: 1, marginLeft: spacing.lg }}>
          <Text variant="h2" tone="onAccent">{user?.name}</Text>
          <Text variant="small" tone="onAccent" style={{ opacity: 0.75 }}>
            {user?.code} · {user?.role}
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

      {isAdmin ? (
        <>
          <SectionHeader title="Configuration" />
          <ConfigRow
            icon="layers"
            title="Materials & thicknesses"
            subtitle="What can be picked while punching"
            onPress={() => navigation.navigate('AdminMaterials')}
          />
          <ConfigRow
            icon="ruler"
            title="Size presets"
            subtitle="Common sizes, entered in any unit"
            onPress={() => navigation.navigate('AdminSizes')}
          />
          <ConfigRow
            icon="flow"
            title="Status flow"
            subtitle="Stages and the moves allowed between them"
            onPress={() => navigation.navigate('AdminFlow')}
          />
          <ConfigRow
            icon="tag"
            title="Lead fields & sources"
            subtitle="What you capture on an enquiry"
            onPress={() => navigation.navigate('AdminLeadFields')}
          />
        </>
      ) : null}

      <SectionHeader title="About" />
      <Card tone="dark">
        <Row label="Server" value={API_BASE_URL.replace('/api', '')} />
        <Row label="Signed in as" value={user?.code ?? '—'} />
        <Row label="Role" value={user?.role ?? '—'} />
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
    </Screen>
  );
}

function ConfigRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: any;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Card tone="dark" style={styles.configRow} onPress={onPress}>
      <View style={styles.configIcon}>
        <Icon name={icon} size={19} color={palette.accent} />
      </View>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text variant="body" bold>{title}</Text>
        <Text variant="tiny" tone="muted">{subtitle}</Text>
      </View>
      <Icon name="chevronRight" size={16} color={palette.textFaint} />
    </Card>
  );
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
  profile: { flexDirection: 'row', alignItems: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  configIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.surfaceLit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
});

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { CustomFieldDefinition, Material, SizePreset, Workflow } from '@decor/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { Card, Icon, IconName, Screen, ScreenHeader, Text } from '../../ui';
import { palette, spacing } from '../../theme';

/**
 * Everything an admin can configure, in one place.
 *
 * Each row shows how much is currently set up, so the shop can see at a glance
 * whether a list is thin — an empty materials list is the difference between
 * punching being possible and not.
 */
export function AdminHomeScreen({ navigation }: { navigation: any }) {
  const materials = useApi<Material[]>(() => api.materials(true), []);
  const sizes = useApi<SizePreset[]>(() => api.sizePresets(true), []);
  const fields = useApi<CustomFieldDefinition[]>(() => api.leadFields(true), []);
  const workflows = useApi<Workflow[]>(() => api.workflows(), []);

  const stageCount = (workflows.data ?? []).reduce(
    (sum, workflow) => sum + (workflow._count?.statuses ?? 0),
    0,
  );

  const rows: {
    icon: IconName;
    title: string;
    subtitle: string;
    count: string;
    route: string;
  }[] = [
    {
      icon: 'layers',
      title: 'Materials',
      subtitle: 'What can be picked while punching, and its thicknesses',
      count: `${materials.data?.length ?? 0}`,
      route: 'AdminMaterials',
    },
    {
      icon: 'ruler',
      title: 'Sizes',
      subtitle: 'Common presets, entered in any unit',
      count: `${sizes.data?.length ?? 0}`,
      route: 'AdminSizes',
    },
    {
      icon: 'flow',
      title: 'Status flow',
      subtitle: 'Stages and the moves allowed between them',
      count: `${stageCount}`,
      route: 'AdminFlow',
    },
    {
      icon: 'tag',
      title: 'Lead fields',
      subtitle: 'What you capture on an enquiry, and where it came from',
      count: `${fields.data?.length ?? 0}`,
      route: 'AdminLeadFields',
    },
  ];

  return (
    <Screen refreshing={materials.refreshing} onRefresh={materials.refresh}>
      <ScreenHeader
        title="Admin"
        subtitle="Shop configuration"
        onBack={() => navigation.goBack()}
      />

      <Text variant="small" tone="muted" style={styles.intro}>
        Everything here is live — change it and the punch screen, the boards and
        the rules the API enforces all follow immediately.
      </Text>

      {rows.map((row, index) => (
        <Animated.View key={row.route} entering={FadeInDown.delay(index * 60).duration(320)}>
          <Card tone="dark" style={styles.row} onPress={() => navigation.navigate(row.route)}>
            <View style={styles.iconWell}>
              <Icon name={row.icon} size={20} color={palette.accent} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text variant="body" bold>{row.title}</Text>
              <Text variant="tiny" tone="muted" numberOfLines={2}>{row.subtitle}</Text>
            </View>
            <Text variant="h3" tone="accent" style={{ marginRight: spacing.sm }}>
              {row.count}
            </Text>
            <Icon name="chevronRight" size={16} color={palette.textFaint} />
          </Card>
        </Animated.View>
      ))}

      <Card tone="dark" style={styles.row} onPress={() => navigation.navigate('Settings')}>
        <View style={styles.iconWell}>
          <Icon name="settings" size={20} color={palette.textMuted} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text variant="body" bold>Settings</Text>
          <Text variant="tiny" tone="muted">Display unit, account, sign out</Text>
        </View>
        <Icon name="chevronRight" size={16} color={palette.textFaint} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, padding: spacing.md },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.surfaceInset,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

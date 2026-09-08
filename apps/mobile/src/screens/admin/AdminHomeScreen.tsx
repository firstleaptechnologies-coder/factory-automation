import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { CustomFieldDefinition, Material, NavGroup, NavItem, SizePreset, Workflow } from '@decor/shared';
import { NAV_GROUPS } from '@decor/shared';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useApi } from '../../hooks/useApi';
import { Card, Icon, IconName, Screen, ScreenHeader, Text } from '../../ui';
import { palette, spacing } from '../../theme';

/**
 * Everything the app can reach, grouped by what it is for.
 *
 * Read from the shared navigation tree rather than from a list of its own, so
 * the app's menu and the web sidebar cannot drift apart and a new screen has an
 * obvious home. Categories fold away because the product is one module today
 * and will be several: a list that only grows becomes a list nobody reads.
 *
 * The counts on the settings rows are the reason this screen is worth opening
 * rather than being a plain index — an empty materials list is the difference
 * between punching being possible and not.
 */
export function AdminHomeScreen({ navigation }: { navigation: any }) {
  const { can, has } = useAuth();
  const materials = useApi<Material[]>(() => api.materials(true), []);
  const sizes = useApi<SizePreset[]>(() => api.sizePresets(true), []);
  const fields = useApi<CustomFieldDefinition[]>(() => api.leadFields(true), []);
  const workflows = useApi<Workflow[]>(() => api.workflows(), []);

  /*
   * What is shut, rather than what is open: a category added in a later
   * release is then open by default, instead of being hidden from everybody
   * who had ever collapsed anything.
   */
  const [closed, setClosed] = useState<string[]>([]);

  const stageCount = (workflows.data ?? []).reduce(
    (sum, workflow) => sum + (workflow._count?.statuses ?? 0),
    0,
  );

  /** How much is set up, where a number says something useful. */
  const counts: Record<string, number | undefined> = {
    materials: materials.data?.length,
    sizes: sizes.data?.length,
    flow: stageCount,
    'lead-fields': fields.data?.length,
  };

  /** What each screen is, in the shop's own words. */
  const blurbs: Record<string, string> = {
    punch: 'Take a new order, on the floor',
    orders: 'Everything punched, and where each one stands',
    leads: 'Enquiries that have not become work yet',
    quotes: 'Priced quotations, before there is an order',
    materials: 'What can be picked while punching, and its thicknesses',
    sizes: 'Common presets, entered in any unit',
    flow: 'Stages and the moves allowed between them',
    'lead-fields': 'What you capture on an enquiry, and where it came from',
    transactions: 'Every payment, deposit and what is still in hand',
    payouts: 'Money paid to others out of orders, once the client has paid',
    clients: 'Everyone the shop works for, and what each has ordered',
    firm: 'GST number, bank details, terms and your letterhead',
    settings: 'Display unit, account, sign out',
  };

  /*
   * Two gates, and both have to pass: the plan decides what the business
   * bought, the role decides who inside it may touch it.
   */
  const visible = (item: NavItem) =>
    Boolean(item.app) &&
    (!item.permission || can(item.permission)) &&
    (!item.module || has(item.module));

  const groupHas = (group: NavGroup): boolean =>
    group.items.some(visible) || (group.groups ?? []).some(groupHas);

  const toggle = (key: string) =>
    setClosed((current) =>
      current.includes(key) ? current.filter((one) => one !== key) : [...current, key],
    );

  const renderGroup = (group: NavGroup, depth = 0) => {
    if (!groupHas(group)) return null;
    const shut = closed.includes(group.key);

    return (
      <View
        key={group.key}
        style={[styles.section, depth ? styles.nested : null]}>
        {/*
          Pressable rather than a touch handler: a touch that merely *ends*
          here — the tail of the tap that opened this screen, say — must not
          fold a category away.
        */}
        <Pressable
          testID={`menu-group-${group.key}`}
          accessibilityRole="button"
          accessibilityState={{ expanded: !shut }}
          style={styles.groupHead}
          onPress={() => toggle(group.key)}>
          <Icon
            name={shut ? 'chevronRight' : 'chevronDown'}
            size={14}
            color={palette.textFaint}
          />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text variant="label" tone="muted">{group.label}</Text>
            {group.blurb ? (
              <Text variant="tiny" tone="faint">{group.blurb}</Text>
            ) : null}
          </View>
        </Pressable>

        {shut
          ? null
          : (
              <>
                {group.items.filter(visible).map((item, index) => (
                  <Animated.View
                    key={item.key}
                    entering={FadeInDown.delay(Math.min(index, 6) * 40).duration(280)}>
                    <Card
                      tone="dark"
                      style={styles.row}
                      onPress={() => navigation.navigate(item.app as string)}>
                      <View style={styles.iconWell}>
                        <Icon name={item.icon as IconName} size={20} color={palette.accent} />
                      </View>
                      <View style={{ flex: 1, marginLeft: spacing.md }}>
                        <Text variant="body" bold>{item.label}</Text>
                        {blurbs[item.key] ? (
                          <Text variant="tiny" tone="muted" numberOfLines={2}>
                            {blurbs[item.key]}
                          </Text>
                        ) : null}
                      </View>
                      {counts[item.key] !== undefined ? (
                        <Text
                          variant="h3"
                          tone="accent"
                          style={{ marginRight: spacing.sm }}>
                          {counts[item.key]}
                        </Text>
                      ) : null}
                      <Icon name="chevronRight" size={16} color={palette.textFaint} />
                    </Card>
                  </Animated.View>
                ))}
                {(group.groups ?? []).map((inner) => renderGroup(inner, depth + 1))}
              </>
            )}
      </View>
    );
  };

  return (
    <Screen refreshing={materials.refreshing} onRefresh={materials.refresh}>
      <ScreenHeader
        title="Menu"
        subtitle="Every screen, by what it is for"
        onBack={() => navigation.goBack()}
      />

      <Text variant="small" tone="muted" style={styles.intro}>
        Settings here are live — change one and the punch screen, the boards and
        the rules the API enforces all follow immediately.
      </Text>

      {NAV_GROUPS.map((group) => renderGroup(group))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: spacing.lg },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  /*
   * The rule down the left of a category, and the step in from it.
   *
   * Without them the headings were the only thing saying where one category
   * ended and the next began, and a settings group nested inside a category
   * was indistinguishable from a category of its own.
   */
  section: {
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.14)',
    marginBottom: spacing.sm,
  },
  /* A category inside a category gets its own rule, stepped in again. */
  nested: { marginLeft: spacing.sm, borderLeftColor: 'rgba(255,255,255,0.09)' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  iconWell: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: palette.surfaceInset,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

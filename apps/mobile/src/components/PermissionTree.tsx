import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  MODULE_CATALOGUE,
  PERMISSION_LABELS,
  PERMISSION_TREE,
  permissionsUnder,
  tickState,
  toggleBranch,
} from '@fas/shared';
import type { ModuleKey, Permission, PermissionSection, TickState } from '@fas/shared';
import { Icon, Text } from '../ui';
import { palette, radius, spacing } from '../theme';

/**
 * Every permission, as the four-level tree it actually is.
 *
 *   module → feature → group → permission
 *
 * The same tree the browser shows, folded for a phone: a section is shut until
 * somebody opens it, because ten sections opened at once is a screen nobody
 * scrolls to the end of. What does not change is the meaning — `Select all` at
 * each level, and a three-state tick, so a branch holding some of its
 * permissions reads as part-ticked and never as off. Off invites somebody to
 * tick it and silently grant the rest.
 *
 * A section for a module the workspace has not bought is shown, greyed and
 * unticked. Hiding it would tell somebody looking for Purchasing that the
 * product has no such thing, rather than that it is not on their plan.
 */

function Box({ state, locked }: { state: TickState; locked?: boolean }) {
  return (
    <View
      style={[
        styles.box,
        state !== 'none' && !locked ? styles.boxOn : null,
        locked ? styles.boxLocked : null,
      ]}
      testID={`perm-box-${state}`}>
      {state === 'all' ? (
        <Icon name="check" size={12} color={palette.textOnAccent} />
      ) : state === 'some' ? (
        <View style={styles.part} />
      ) : null}
    </View>
  );
}

function SelectAll({
  permissions,
  granted,
  onChange,
}: {
  permissions: Permission[];
  granted: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={styles.selectAll}
      onPress={() => onChange(toggleBranch(permissions, granted))}>
      <Box state={tickState(permissions, granted)} />
      <Text variant="tiny" tone="muted">Select all</Text>
    </Pressable>
  );
}

function Section({
  section,
  granted,
  bought,
  onChange,
}: {
  section: PermissionSection;
  granted: string[];
  bought: boolean;
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const all = permissionsUnder(section);
  const held = all.filter((one) => granted.includes(one)).length;
  const moduleLabel = MODULE_CATALOGUE.find((one) => one.key === section.module)?.label;

  return (
    <View style={[styles.section, bought ? null : styles.locked]} testID={`perm-section-${section.key}`}>
      <Pressable
        accessibilityRole="button"
        style={styles.sectionHead}
        onPress={() => setOpen((was) => !was)}>
        <Icon
          name={open ? 'chevronDown' : 'chevronRight'}
          size={16}
          color={palette.textMuted}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="h3">{section.label}</Text>
          <Text variant="tiny" tone="muted">
            {bought
              ? `${held} of ${all.length}`
              : `${moduleLabel ?? section.label} is not on this workspace’s plan`}
          </Text>
        </View>
        {bought ? <SelectAll permissions={all} granted={granted} onChange={onChange} /> : (
          <Icon name="lock" size={15} color={palette.textFaint} />
        )}
      </Pressable>

      {open
        ? section.features.map((feature) => (
            <View key={feature.key} style={styles.feature}>
              <View style={styles.featureHead}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="small" bold>{feature.label}</Text>
                  {feature.blurb ? (
                    <Text variant="tiny" tone="muted">{feature.blurb}</Text>
                  ) : null}
                </View>
                {bought ? (
                  <SelectAll
                    permissions={permissionsUnder(feature)}
                    granted={granted}
                    onChange={onChange}
                  />
                ) : null}
              </View>

              {feature.groups.map((group) => (
                <View key={group.key} style={styles.group}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!bought}
                    style={styles.groupHead}
                    onPress={() => onChange(toggleBranch(group.permissions, granted))}>
                    <Box state={tickState(group.permissions, granted)} locked={!bought} />
                    <Text variant="tiny" tone="muted">{group.label}</Text>
                  </Pressable>

                  {group.permissions.map((permission) => {
                    const on = granted.includes(permission);
                    return (
                      <Pressable
                        key={permission}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on, disabled: !bought }}
                        disabled={!bought}
                        style={styles.check}
                        onPress={() =>
                          onChange(
                            on
                              ? granted.filter((one) => one !== permission)
                              : [...granted, permission],
                          )
                        }>
                        <Box state={on ? 'all' : 'none'} locked={!bought} />
                        <Text variant="small" tone={on ? 'default' : 'muted'}>
                          {PERMISSION_LABELS[permission as Permission] ?? permission}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          ))
        : null}
    </View>
  );
}

export function PermissionTree({
  granted,
  has,
  onChange,
}: {
  granted: string[];
  /** Whether the workspace bought a module. */
  has: (module: ModuleKey) => boolean;
  onChange: (next: string[]) => void;
}) {
  return (
    <View>
      {PERMISSION_TREE.map((section) => (
        <Section
          key={section.key}
          section={section}
          granted={granted}
          bought={section.module === null || has(section.module)}
          onChange={onChange}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: radius.md,
    backgroundColor: palette.surfaceInset,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  locked: { opacity: 0.45 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  feature: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.surfaceLit,
  },
  featureHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  group: {
    borderLeftWidth: 2,
    borderLeftColor: palette.surfaceLit,
    paddingLeft: spacing.md,
    marginTop: spacing.sm,
  },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  box: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: palette.textFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: palette.accent, borderColor: palette.accent },
  boxLocked: { borderColor: palette.textFaint, backgroundColor: 'transparent' },
  part: { width: 8, height: 2, borderRadius: 1, backgroundColor: palette.textOnAccent },
});

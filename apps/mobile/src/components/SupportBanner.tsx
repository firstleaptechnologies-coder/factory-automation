import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { Text } from '../ui';
import { palette, spacing } from '../theme';

/**
 * Somebody from Decor Bucket is inside this workspace.
 *
 * Above everything, for as long as it lasts, and not dismissible. A support
 * session that looks like an ordinary one is how a shop ends up believing its
 * own admin did something — this is their assurance that they can tell our
 * hands from their own.
 */
export function SupportBanner() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  if (!user?.impersonatedBy) return null;

  return (
    <View
      testID="support-banner"
      accessibilityRole="alert"
      style={[styles.bar, { paddingTop: insets.top + spacing.sm }]}>
      <Text variant="tiny" style={styles.words}>
        <Text variant="tiny" bold style={styles.words}>
          {user.impersonatedBy.name}
        </Text>{' '}
        from Decor Bucket support is in this workspace as {user.name}. Everything done here is
        recorded under that name.
      </Text>
      <Pressable onPress={signOut} accessibilityRole="button" hitSlop={8}>
        <Text variant="tiny" bold style={styles.words}>
          Leave
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: palette.warning,
  },
  /** Dark words on the warning colour, which is deliberately bright. */
  words: { color: '#1F2327' },
});

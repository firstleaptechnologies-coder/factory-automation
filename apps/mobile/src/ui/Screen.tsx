import React from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  ViewStyle,
  RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gradients, palette, spacing } from '../theme';

/**
 * Every screen sits on the same gradient ground: a hint of lime at the top
 * falling into near-black. It gives the app depth without a single image, and
 * it is what makes the lime cards look lit rather than pasted on.
 */
export function Screen({
  children,
  scroll = true,
  padded = true,
  refreshing,
  onRefresh,
  style,
  /** Extra bottom room so content clears the floating tab bar. */
  tabBarPadding = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: ViewStyle;
  tabBarPadding?: boolean;
}) {
  const insets = useSafeAreaInsets();

  const content = (
    <View
      style={[
        padded && styles.padded,
        // A non-scrolling screen has to fill its parent, or children that use
        // flex — the punch keypad pinned to the bottom, for one — have nothing
        // to size against and collapse to nothing.
        !scroll && styles.fill,
        { paddingBottom: tabBarPadding ? 120 : spacing.xl },
        style,
      ]}>
      {children}
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={gradients.screen}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      />
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + spacing.sm }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={Boolean(refreshing)}
                onRefresh={onRefresh}
                tintColor={palette.accent}
                colors={[palette.accent]}
              />
            ) : undefined
          }>
          {content}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: insets.top + spacing.sm }}>{content}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  fill: { flex: 1 },
  padded: { paddingHorizontal: spacing.lg },
});

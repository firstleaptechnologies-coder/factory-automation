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
  onEndReached,
  sticky,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: ViewStyle;
  tabBarPadding?: boolean;
  /** Fired once per approach to the bottom, for paged lists. */
  onEndReached?: () => void;
  /**
   * What stays at the top while the rest scrolls under it.
   *
   * A list you are searching or filtering is a list you are working on: having
   * to scroll back up to change the search, or to see which filters are on, is
   * the thing that makes a long list tiring. The bar carries its own top inset,
   * because once pinned it sits where the notch is.
   */
  sticky?: React.ReactNode;
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
          testID="screen-scroll"
          // The sticky bar carries the top inset when there is one, so the
          // content below it starts flush against it.
          contentContainerStyle={{ paddingTop: sticky ? 0 : insets.top + spacing.sm }}
          stickyHeaderIndices={sticky ? [0] : undefined}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={64}
          onScroll={
            onEndReached
              ? (event) => {
                  const { contentOffset, contentSize, layoutMeasurement } =
                    event.nativeEvent;
                  const distanceToBottom =
                    contentSize.height - contentOffset.y - layoutMeasurement.height;
                  // Fetch a screen's worth early so the next page is usually
                  // there before the list runs out under the thumb.
                  if (distanceToBottom < layoutMeasurement.height * 0.6) onEndReached();
                }
              : undefined
          }
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
          {sticky ? (
            <View
              testID="sticky-bar"
              style={[
                styles.sticky,
                padded && styles.padded,
                { paddingTop: insets.top + spacing.sm },
              ]}>
              {sticky}
            </View>
          ) : null}
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
  /*
   * The ground is painted behind the scroller and does not move, so a bar
   * pinned to the top of the viewport always sits over the same band of it —
   * which is why a flat colour matches rather than showing a seam.
   */
  sticky: { backgroundColor: gradients.screen[0], paddingBottom: spacing.sm },
});

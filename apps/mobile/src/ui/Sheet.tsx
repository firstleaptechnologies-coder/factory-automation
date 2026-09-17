import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { Easing, FadeIn, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, radius, spacing } from '../theme';
import { Text } from './Text';
import { Icon } from './Icon';

/**
 * Bottom sheet.
 *
 * Pickers and short forms open here rather than pushing a screen: the context
 * behind stays visible, which matters when someone is choosing a material while
 * reading a size off the row above.
 */
export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
  fullHeight,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  fullHeight?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        <Pressable testID="sheet-backdrop" style={StyleSheet.absoluteFill} onPress={onClose} />
        {/*
          A sheet lives at the bottom of the screen, which is precisely where
          the keyboard arrives — so every form in one had its last fields and
          its Save button underneath it.

          The surface is lifted rather than the content scrolled, because a
          sheet is short: pushing it up keeps the field, its hint and the
          button together, where scrolling would leave the button below the
          fold with nothing to say it was there.

          A Modal on Android is its own window and the manifest's adjustResize
          does not reach inside it, so unlike Screen this one needs a behavior
          on both platforms.
        */}
        <KeyboardAvoidingView
          testID="sheet-keyboard"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.lift}>
        <Animated.View
          // A plain rise from the bottom. A spring here overshoots and bounces,
          // which reads as the sheet wobbling rather than arriving.
          entering={SlideInDown.duration(240).easing(Easing.out(Easing.cubic))}
          exiting={SlideOutDown.duration(180).easing(Easing.in(Easing.cubic))}
          testID="sheet-surface"
          style={[
            styles.sheet,
            fullHeight && { height: '88%' },
            { paddingBottom: Math.max(insets.bottom, spacing.lg) },
          ]}>
          <View style={styles.grabber} />
          {title ? (
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text variant="h2">{title}</Text>
                {subtitle ? (
                  <Text variant="small" tone="muted">{subtitle}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                // An icon-only pad; without this it announces as nothing.
                accessibilityLabel="Close"
                style={styles.close}
                hitSlop={8}>
                <Icon name="close" size={18} color={palette.textMuted} />
              </Pressable>
            </View>
          ) : null}
          <ScrollView
            testID="sheet-body"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.body}>
            {children}
          </ScrollView>
        </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

/** A row in a picker sheet. */
export function SheetOption({
  label,
  description,
  selected,
  accent,
  onPress,
}: {
  label: string;
  description?: string;
  selected?: boolean;
  accent?: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(selected) }}
      style={[
        styles.option,
        selected && styles.optionSelected,
        selected && { borderColor: palette.accent },
      ]}>
      {accent ? (
        <View testID="sheet-option-dot" style={[styles.dot, { backgroundColor: accent }]} />
      ) : null}
      <View style={{ flex: 1 }}>
        <Text variant="body" bold={selected}>{label}</Text>
        {description ? (
          <Text variant="tiny" tone="muted">{description}</Text>
        ) : null}
      </View>
      {selected ? <Icon name="check" size={18} color={palette.accent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  /* Bottom-anchored, so the sheet keeps its shape as the keyboard lifts it. */
  lift: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: spacing.lg,
    maxHeight: '88%',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.surfaceLit,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surfaceLit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /*
   * Generous, because the last control in a sheet is usually an accent button
   * and its glow extends well past its box. With only a little padding the
   * scroll view clipped that halo into a hard edge, which read as a broken
   * shadow sitting under the button.
   */
  body: { paddingBottom: spacing.xxl + spacing.lg },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    backgroundColor: palette.surfaceLit,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  /** Border colour is applied inline — the accent is runtime-configurable. */
  optionSelected: { borderWidth: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});

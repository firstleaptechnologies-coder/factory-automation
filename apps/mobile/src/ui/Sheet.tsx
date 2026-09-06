import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown, SlideOutDown } from 'react-native-reanimated';
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
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(180)}
          exiting={SlideOutDown.duration(180)}
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
              <Pressable onPress={onClose} style={styles.close} hitSlop={8}>
                <Icon name="close" size={18} color={palette.textMuted} />
              </Pressable>
            </View>
          ) : null}
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.body}>
            {children}
          </ScrollView>
        </Animated.View>
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
      style={[styles.option, selected && styles.optionSelected]}>
      {accent ? <View style={[styles.dot, { backgroundColor: accent }]} /> : null}
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
  body: { paddingBottom: spacing.xl },
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
  optionSelected: { borderColor: palette.accent },
  dot: { width: 10, height: 10, borderRadius: 5 },
});

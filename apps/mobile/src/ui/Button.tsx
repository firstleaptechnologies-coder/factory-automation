import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { motion, palette, radius as R, spacing } from '../theme';
import { Text } from './Text';
import { AccentSurface, Neumorph } from './Neumorph';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function haptic(
  type: 'impactLight' | 'impactMedium' | 'notificationSuccess' | 'notificationError' = 'impactLight',
) {
  ReactNativeHapticFeedback.trigger(type, {
    enableVibrateFallback: true,
    ignoreAndroidSystemSettings: false,
  });
}

/**
 * On this theme a button is a raised pad. Pressing it flips the surface to
 * inset, so it genuinely looks pushed into the panel rather than just dimmed.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  icon,
  size = 'md',
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'dark' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const scale = useSharedValue(1);
  const [pressed, setPressed] = React.useState(false);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isDisabled = disabled || loading;

  const height = size === 'lg' ? 60 : size === 'sm' ? 40 : 52;
  const tone =
    variant === 'primary' && !isDisabled
      ? 'onAccent'
      : variant === 'danger'
        ? 'danger'
        : isDisabled
          ? 'faint'
          : 'default';

  const body = (
    <View style={[styles.inner, { height }]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? palette.white : palette.accent} />
      ) : (
        <>
          {icon}
          <Text
            variant={size === 'sm' ? 'small' : 'body'}
            tone={tone}
            bold
            style={icon ? { marginLeft: spacing.sm } : undefined}>
            {title}
          </Text>
        </>
      )}
    </View>
  );

  return (
    <AnimatedPressable
      disabled={isDisabled}
      onPress={() => {
        haptic('impactLight');
        onPress();
      }}
      onPressIn={() => {
        setPressed(true);
        scale.value = withSpring(0.98, motion.spring);
      }}
      onPressOut={() => {
        setPressed(false);
        scale.value = withSpring(1, motion.spring);
      }}
      style={[animatedStyle, isDisabled && { opacity: 0.6 }, style]}>
      {/*
        A disabled primary is drawn as a plain pad rather than a dimmed accent.
        Fading orange to 45% turns it muddy brown, which reads as a broken
        button rather than an unavailable one.
      */}
      {variant === 'primary' && !isDisabled ? (
        <AccentSurface radius={R.pill} soft={pressed}>
          {body}
        </AccentSurface>
      ) : (
        <Neumorph variant={pressed ? 'inset' : 'raised'} radius={R.pill} size="sm">
          {body}
        </Neumorph>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
});

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { motion, palette, radius, spacing } from '../theme';
import { Neumorph } from './Neumorph';
import { Text } from './Text';
import { Icon } from './Icon';
import { haptic } from './Button';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;

/**
 * A purpose-built keypad rather than the system keyboard.
 *
 * Sizes are the only thing typed on this screen and they are short numbers, so
 * big fixed targets beat a keyboard that covers half the display and shifts the
 * layout every time it opens.
 */
export function Keypad({
  onKey,
  onBackspace,
  onClear,
}: {
  onKey: (key: string) => void;
  onBackspace: () => void;
  onClear?: () => void;
}) {
  return (
    <View style={styles.grid}>
      {KEYS.map((key) => (
        <Key
          key={key}
          label={key}
          onPress={() => {
            haptic('impactLight');
            if (key === 'back') onBackspace();
            else onKey(key);
          }}
          onLongPress={key === 'back' ? onClear : undefined}
        />
      ))}
    </View>
  );
}

function Key({
  label,
  onPress,
  onLongPress,
}: {
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const scale = useSharedValue(1);
  const [pressed, setPressed] = React.useState(false);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        setPressed(true);
        scale.value = withSpring(0.96, motion.spring);
      }}
      onPressOut={() => {
        setPressed(false);
        scale.value = withSpring(1, motion.spring);
      }}
      style={[styles.keySlot, animatedStyle]}>
      <Neumorph variant={pressed ? 'inset' : 'raised'} radius={radius.lg} size="sm" contentStyle={styles.key}>
        {label === 'back' ? (
          <Icon name="back" size={22} color={palette.textMuted} />
        ) : (
          <Text variant="h2" style={styles.keyLabel}>{label}</Text>
        )}
      </Neumorph>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.sm,
  },
  keySlot: { width: '31.5%' },
  key: { height: 58, alignItems: 'center', justifyContent: 'center' },
  keyLabel: { color: palette.text, fontWeight: '600' },
});

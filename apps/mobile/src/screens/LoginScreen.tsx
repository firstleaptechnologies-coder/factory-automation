import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { Button, Field, Icon, Text, haptic } from '../ui';
import { gradients, palette, radius, shadow, spacing } from '../theme';

/**
 * Sign in.
 *
 * The lime mark breathes slowly while the screen is idle. It is a small thing,
 * but it makes the app feel awake before anyone has touched it.
 */
export function LoginScreen() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const breathe = useSharedValue(0);
  React.useEffect(() => {
    breathe.value = withRepeat(
      withSequence(withTiming(1, { duration: 2200 }), withTiming(0, { duration: 2200 })),
      -1,
      false,
    );
  }, [breathe]);

  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breathe.value * 0.06 }],
    opacity: 0.85 + breathe.value * 0.15,
  }));

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn(identifier.trim(), password);
      haptic('notificationSuccess');
    } catch (e) {
      haptic('notificationError');
      setError(e instanceof Error ? e.message : 'Sign in failed');
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View entering={FadeIn.duration(600)} style={styles.brandBlock}>
          <Animated.View style={[markStyle, shadow.glow]}>
            <LinearGradient colors={gradients.accent} style={styles.mark}>
              <Icon name="scan" size={34} color={palette.textOnAccent} strokeWidth={2} />
            </LinearGradient>
          </Animated.View>
          <Text variant="h1" style={styles.brand}>Decor Bucket</Text>
          <Text variant="small" tone="muted">Order punching for the floor</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(500).springify()}>
          <Field
            label="Employee code"
            placeholder="e.g. SALES01"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="characters"
            autoCorrect={false}
            icon="user"
          />
          <Field
            label="Password"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            icon="settings"
            onSubmitEditing={submit}
            error={error}
          />

          <Button title="Sign in" size="lg" loading={busy} onPress={submit} />
        </Animated.View>

        <Text variant="tiny" tone="faint" style={styles.footer}>
          Code, phone or email all work.
        </Text>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  brandBlock: { alignItems: 'center', marginBottom: spacing.xxl },
  mark: {
    width: 82,
    height: 82,
    borderRadius: radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { marginTop: spacing.lg },
  footer: { textAlign: 'center', marginTop: spacing.xl },
});

import React, { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
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
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, Field, Icon, Text, haptic } from '../ui';
import { gradients, palette, radius, spacing } from '../theme';

type Mode = 'workspace' | 'credentials' | 'platform';

/**
 * Sign in.
 *
 * Two steps, because a person cannot be identified until the workspace is
 * known — employee codes are unique inside a business, not across the platform,
 * and two clients may both have an ADMIN. The workspace is remembered after the
 * first time, so the shop only ever types it once.
 */
export function LoginScreen() {
  const { signIn, signInAsPlatform, workspace: savedWorkspace } = useAuth();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>('workspace');
  const [workspace, setWorkspace] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A device that has signed in before skips straight to the password.
  useEffect(() => {
    if (savedWorkspace) {
      setWorkspace(savedWorkspace);
      setMode('credentials');
    }
  }, [savedWorkspace]);

  const breathe = useSharedValue(0);
  useEffect(() => {
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

  const continueToCredentials = async () => {
    setError(null);
    setBusy(true);
    try {
      // Checked before asking for a password, so a typo in the workspace is
      // caught while it is still obvious what went wrong.
      await api.workspaceExists(workspace.trim().toLowerCase());
      setMode('credentials');
      haptic('impactLight');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That workspace was not found');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'platform') {
        await signInAsPlatform(email.trim(), password);
      } else {
        await signIn(workspace.trim().toLowerCase(), identifier.trim(), password);
      }
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
          {/* The lockup carries the name and the tagline, so neither is
              repeated underneath it. Light artwork, because the brand teal is
              nearly invisible on this ground. */}
          <Animated.View style={markStyle}>
            <Image
              source={require('../assets/fas-lockup-light.png')}
              style={styles.lockup}
              resizeMode="contain"
              accessibilityLabel="FAS — Factory Automation Software, by FirstLeap Technologies"
            />
          </Animated.View>
          <Text variant="small" tone="muted" style={styles.strap}>
            {mode === 'platform' ? 'Platform administration' : 'Order punching for the floor'}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(500).springify()}>
          {mode === 'workspace' ? (
            <>
              <Field
                label="Workspace"
                placeholder="your-shop"
                value={workspace}
                onChangeText={setWorkspace}
                autoCapitalize="none"
                autoCorrect={false}
                icon="box"
                error={error}
                hint="The short name your provider gave you."
                onSubmitEditing={continueToCredentials}
              />
              <Button
                title="Continue"
                size="lg"
                loading={busy}
                disabled={!workspace.trim()}
                onPress={continueToCredentials}
              />
            </>
          ) : mode === 'credentials' ? (
            <>
              <Pressable onPress={() => { setMode('workspace'); setError(null); }}>
                <View style={styles.workspaceChip}>
                  <Icon name="box" size={14} color={palette.accent} />
                  <Text variant="small" tone="accent" bold style={{ marginLeft: 6 }}>
                    {workspace}
                  </Text>
                  <Text variant="tiny" tone="muted" style={{ marginLeft: 8 }}>change</Text>
                </View>
              </Pressable>

              <Field
                label="Employee code"
                placeholder="e.g. ADMIN"
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
                icon="lock"
                onSubmitEditing={submit}
                error={error}
              />
              <Button
                title="Sign in"
                size="lg"
                loading={busy}
                disabled={!identifier.trim() || !password}
                onPress={submit}
              />
            </>
          ) : (
            <>
              <Field
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                icon="user"
              />
              <Field
                label="Password"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                icon="lock"
                onSubmitEditing={submit}
                error={error}
              />
              <Button
                title="Sign in to platform"
                size="lg"
                loading={busy}
                disabled={!email.trim() || !password}
                onPress={submit}
              />
            </>
          )}
        </Animated.View>

        <Pressable
          onPress={() => {
            setMode(mode === 'platform' ? 'workspace' : 'platform');
            setError(null);
            setPassword('');
          }}
          style={styles.footerLink}>
          <Text variant="tiny" tone="faint">
            {mode === 'platform' ? 'Sign in to a workspace instead' : 'Platform administration'}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  brandBlock: { alignItems: 'center', marginBottom: spacing.xxl },
  // Sized by width; the lockup is taller than it is wide, so the height
  // follows from resizeMode contain rather than being fixed twice.
  lockup: { width: 208, height: 300 },
  strap: { marginTop: spacing.sm },
  workspaceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceInset,
  },
  footerLink: { alignItems: 'center', marginTop: spacing.xl },
});

import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import type { Release } from '@fas/shared';
import { api } from '../../api/client';
import { Text, haptic } from '../../ui';
import { palette, radius, spacing } from '../../theme';

/**
 * The rungs a rollout is walked up.
 *
 * Publishing is a staged decision — up a rung, watch, up again — not a number
 * somebody types. Zero is not a rung: that is Pause, a different intention,
 * and it sits with the other second-thoughts controls below.
 */
export const STEPS = [20, 40, 60, 80, 100] as const;

/**
 * Everything one release can have done to it, on a phone.
 *
 * The same control whether the release is a draft or live: a draft goes live
 * at the rung you press, a live one moves to it. It used to be a wrapping row
 * of loose chips that changed shape the moment a release went live — which is
 * exactly when somebody is watching it most closely.
 */
export function ReleaseLadder({
  release,
  blockedReason,
  onChanged,
  onError,
}: {
  release: Release;
  /** Set when this must not be published — something newer is already live. */
  blockedReason?: string;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [busyStep, setBusyStep] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  const live = release.status === 'PUBLISHED';
  const blocked = !live && Boolean(blockedReason);

  const run = async (step: number | null, work: () => Promise<unknown>) => {
    onError(null);
    setBusyStep(step);
    setPending(true);
    try {
      await work();
      haptic('notificationSuccess');
      onChanged();
    } catch (error) {
      haptic('notificationError');
      onError(error instanceof Error ? error.message : 'That did not go through');
    } finally {
      setBusyStep(null);
      setPending(false);
    }
  };

  const goTo = (percent: number) =>
    run(percent, () =>
      api.updateRelease(release.id, {
        ...(live ? {} : { status: 'PUBLISHED' as const }),
        rolloutPercent: percent,
      }),
    );

  const rollback = () =>
    Alert.alert(
      'Roll back this release?',
      'It is retired, and the update it replaced goes back to everybody at 100%.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Roll back',
          style: 'destructive',
          onPress: () =>
            void run(null, async () => {
              const { rolledBackTo } = await api.rollbackRelease(release.id);
              if (!rolledBackTo) {
                onError(
                  'Retired. There was no earlier update on this channel, so the app falls back to the bundle inside the binary.',
                );
              }
            }),
        },
      ],
    );

  const archive = () =>
    Alert.alert('Archive this release?', 'It will never be served again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: () =>
          void run(null, () => api.updateRelease(release.id, { status: 'ARCHIVED' })),
      },
    ]);

  return (
    <View style={styles.wrap}>
      <Text variant="label" tone="faint">
        {live ? 'Now at' : 'Publish at'}
      </Text>

      <View style={styles.track} accessibilityRole="radiogroup">
        {STEPS.map((step, index) => {
          const here = live && release.rolloutPercent === step;
          // Rungs already climbed read as filled, so the track shows the
          // distance travelled without anybody reading a number.
          const passed = live && release.rolloutPercent > step;
          return (
            <Pressable
              key={step}
              testID={`rung-${release.id}-${step}`}
              disabled={pending || blocked || here}
              accessibilityRole="button"
              accessibilityLabel={
                blocked
                  ? blockedReason
                  : here
                    ? `Already at ${step} percent`
                    : live
                      ? `Move the rollout to ${step} percent`
                      : `Publish at ${step} percent`
              }
              onPress={() => void goTo(step)}
              style={[
                styles.rung,
                index > 0 && styles.rungDivided,
                passed && styles.rungPassed,
                here && styles.rungHere,
                (blocked || (pending && busyStep !== step)) && styles.rungDim,
              ]}>
              <Text variant="tiny" bold tone={here ? 'default' : 'accent'}>
                {busyStep === step ? '…' : `${step}%`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {blocked ? (
        <Text variant="tiny" tone="warning" style={styles.note}>
          {blockedReason}
        </Text>
      ) : null}

      {/*
        Pausing, reverting and retiring differ in kind from walking the ladder
        up, so they sit apart from it. Side by side, the one that cannot be
        undone is a mis-tap away.
      */}
      <View style={styles.secondary}>
        {live && release.rolloutPercent !== 0 ? (
          <Mini
            label="Pause"
            testID={`pause-${release.id}`}
            disabled={pending}
            onPress={() => void goTo(0)}
          />
        ) : null}
        {live && release.rolloutPercent === 0 ? (
          <Text variant="tiny" tone="muted" style={styles.paused}>
            Paused — serving nobody
          </Text>
        ) : null}
        {live ? (
          <Mini
            label="Roll back"
            tone={palette.warning}
            testID={`rollback-${release.id}`}
            disabled={pending}
            onPress={rollback}
          />
        ) : null}
        {release.status !== 'ARCHIVED' ? (
          <Mini
            label="Archive"
            tone={palette.danger}
            testID={`archive-${release.id}`}
            disabled={pending}
            onPress={archive}
          />
        ) : null}
      </View>
    </View>
  );
}

function Mini({
  label,
  onPress,
  tone,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  tone?: string;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.mini, tone ? { borderColor: tone } : null, disabled && styles.rungDim]}>
      <Text variant="tiny" bold style={tone ? { color: tone } : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md, gap: spacing.sm },
  track: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: palette.accent,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  rung: { flex: 1, alignItems: 'center', paddingVertical: 9 },
  rungDivided: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,107,26,0.3)' },
  rungPassed: { backgroundColor: 'rgba(255,107,26,0.1)' },
  rungHere: { backgroundColor: 'rgba(255,107,26,0.28)' },
  rungDim: { opacity: 0.4 },
  note: { lineHeight: 16 },
  secondary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mini: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.surfaceLit,
    backgroundColor: palette.surfaceShade,
  },
  paused: { paddingVertical: 7 },
});

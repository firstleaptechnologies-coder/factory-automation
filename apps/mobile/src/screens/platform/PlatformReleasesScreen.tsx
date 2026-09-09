import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Release, ReleaseStatus, VersionGate } from '@fas/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
  haptic,
} from '../../ui';
import { palette, spacing } from '../../theme';
import { formatDateTime } from '../../lib/format';

const STATUS_COLOR: Record<ReleaseStatus, string> = {
  DRAFT: palette.surfaceLit,
  PUBLISHED: palette.success,
  ARCHIVED: palette.textFaint,
};

/** The steps a rollout is walked up in. Small enough to stop at. */
const STEPS = [0, 5, 10, 25, 50, 100];

/**
 * What the app is running, and who has it yet.
 *
 * The same screen the browser has, and it earns its place on a phone more than
 * most: a rollout going wrong is something you find out about away from a
 * desk, and walking it back down to zero should not need one.
 *
 * The percentage is sticky per install, so raising it only ever adds people —
 * which is what makes it safe to stop halfway and think. Not a tenant screen:
 * there is one app in the stores for every workspace.
 */
export function PlatformReleasesScreen({ navigation }: { navigation: any }) {
  const { can } = useAuth();
  const [channel, setChannel] = useState('production');

  const releases = useApi<Release[]>(() => api.releases({ channel }), [channel]);
  const gates = useApi<VersionGate[]>(() => api.versionGates(), []);

  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const [gateSheet, setGateSheet] = useState(false);
  const [gatePlatform, setGatePlatform] = useState<'ios' | 'android'>('ios');
  const [minimum, setMinimum] = useState('');
  const [recommended, setRecommended] = useState('');
  const [message, setMessage] = useState('');

  const mayShip = can('platform.release.manage');

  const run = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key);
    setFailed(null);
    try {
      await work();
      haptic('notificationSuccess');
      releases.reload();
      gates.reload();
      return true;
    } catch (error) {
      haptic('notificationError');
      setFailed(error instanceof Error ? error.message : 'That did not work');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const change = (release: Release, body: Record<string, unknown>) =>
    run(release.id, () => api.updateRelease(release.id, body as never));

  return (
    <Screen refreshing={releases.refreshing} onRefresh={releases.refresh}>
      <ScreenHeader
        title="Releases"
        subtitle="What the app is running, and who has it yet"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.chips}>
        {['production', 'staging'].map((one) => (
          <Chip
            key={one}
            label={one}
            selected={channel === one}
            onPress={() => setChannel(one)}
          />
        ))}
      </View>

      {failed ? <Text variant="small" tone="danger">{failed}</Text> : null}

      {releases.loading && !releases.data ? (
        <Loader />
      ) : (releases.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon="box"
          title="Nothing published on this channel"
          message="Releases arrive from the publish script as drafts."
        />
      ) : (
        releases.data?.map((release) => (
          <Card key={release.id} tone="dark" style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3">
                  OTA {release.sequence} · {release.platform}
                </Text>
                <Text variant="tiny" tone="muted">
                  runtime {release.runtimeVersion} · {formatDateTime(release.createdAt)}
                </Text>
              </View>
              {release.kind === 'ROLLBACK' ? (
                <Pill label="Rollback" color={palette.warning} small />
              ) : null}
              <Pill label={release.status} color={STATUS_COLOR[release.status]} small />
            </View>

            {release.changelog ? (
              <Text variant="small" tone="muted" style={{ marginTop: spacing.sm }}>
                {release.changelog}
              </Text>
            ) : null}

            {release.status === 'PUBLISHED' ? (
              <>
                <Text variant="tiny" tone="muted" style={{ marginTop: spacing.sm }}>
                  {release.rolloutPercent}% of installs
                </Text>
                {mayShip ? (
                  <View style={styles.chips}>
                    {/*
                      Sticky buckets mean walking this up only ever adds
                      people, so the steps are safe to stop between — and
                      stepping back down is the reason this screen is worth
                      having on a phone at all.
                    */}
                    {STEPS.filter((step) => step !== release.rolloutPercent).map((step) => (
                      <Chip
                        key={step}
                        label={`${step}%`}
                        onPress={() => void change(release, { rolloutPercent: step })}
                      />
                    ))}
                    <Chip
                      label="Retire"
                      onPress={() => void change(release, { status: 'ARCHIVED' })}
                    />
                  </View>
                ) : null}
              </>
            ) : null}

            {release.status === 'DRAFT' && mayShip ? (
              <Button
                title="Publish to 5%"
                size="sm"
                loading={busy === release.id}
                onPress={() =>
                  void change(release, { status: 'PUBLISHED', rolloutPercent: 5 })
                }
                style={{ marginTop: spacing.sm }}
              />
            ) : null}
          </Card>
        ))
      )}

      <Text variant="label" tone="muted" style={styles.head}>Version floor</Text>
      <Card tone="dark" style={styles.card}>
        {(gates.data?.filter((gate) => gate.channel === channel).length ?? 0) === 0 ? (
          <Text variant="small" tone="muted">
            No floor set. Every binary is allowed to run whatever it can fetch.
          </Text>
        ) : (
          gates.data
            ?.filter((gate) => gate.channel === channel)
            .map((gate) => (
              <View key={gate.id} style={styles.row}>
                <Text variant="small" bold style={{ flex: 1 }}>{gate.platform}</Text>
                <Text variant="tiny" tone="muted">
                  must be {gate.minimumVersion}
                  {gate.recommendedVersion ? ` · asked for ${gate.recommendedVersion}` : ''}
                </Text>
              </View>
            ))
        )}
      </Card>

      {mayShip ? (
        <Button
          title="Set the version floor"
          variant="dark"
          onPress={() => setGateSheet(true)}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      <Sheet
        visible={gateSheet}
        title="Version floor"
        subtitle="For changes an update cannot carry — a native module, a permission"
        onClose={() => setGateSheet(false)}>
        <View style={styles.chips}>
          {(['ios', 'android'] as const).map((one) => (
            <Chip
              key={one}
              label={one}
              selected={gatePlatform === one}
              onPress={() => setGatePlatform(one)}
            />
          ))}
        </View>
        <Field
          label="Must be at least"
          placeholder="1.2.0"
          value={minimum}
          onChangeText={setMinimum}
          hint="Below this the app stops and says it has to be updated."
        />
        <Field
          label="Ask for (optional)"
          placeholder="1.4.0"
          value={recommended}
          onChangeText={setRecommended}
        />
        <Field label="What to say (optional)" value={message} onChangeText={setMessage} />
        <Button
          title="Set the floor"
          loading={busy === 'gate'}
          disabled={!minimum.trim()}
          onPress={() =>
            void (async () => {
              const done = await run('gate', () =>
                api.setVersionGate({
                  platform: gatePlatform,
                  channel,
                  minimumVersion: minimum.trim(),
                  recommendedVersion: recommended.trim() || undefined,
                  message: message.trim() || undefined,
                }),
              );
              if (done) setGateSheet(false);
            })()
          }
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  head: { marginTop: spacing.xl, marginBottom: spacing.sm },
});

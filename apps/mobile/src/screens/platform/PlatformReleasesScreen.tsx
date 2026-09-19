import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Release, ReleaseStatus, VersionGate } from '@fas/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { usePaginated } from '../../hooks/usePaginated';
import { useAuth } from '../../auth/AuthContext';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  ListFooter,
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
import { ReleaseLadder } from './ReleaseLadder';

const PLATFORMS = ['ios', 'android'] as const;

const STATUS_COLOR: Record<ReleaseStatus, string> = {
  DRAFT: palette.surfaceLit,
  PUBLISHED: palette.success,
  ARCHIVED: palette.textFaint,
};

/**
 * What the app is running, and who has it yet.
 *
 * A release arrives as a draft from the publish robot, gets looked at, then
 * goes in front of a fifth of installs and is walked up. The percentage is
 * sticky per install, so raising it only ever adds people — which is what
 * makes it safe to stop halfway and think.
 *
 * There is no channel picker, and that is the point. Each deployment holds
 * only its own channel: the staging API serves `development`, which TestFlight
 * and Play-internal builds carry, and production serves `production`. A picker
 * offered one real list and one permanently empty one — and once offered
 * "staging", which no binary has ever asked for.
 *
 * Not a tenant screen: there is one app in the stores for every workspace.
 */
export function PlatformReleasesScreen({ navigation }: { navigation: any }) {
  const { can } = useAuth();
  const mayShip = can('platform.release.manage');

  // Asked, not assumed: the app and the API ship separately, and a baked-in
  // guess is how a staging screen starts writing production rows.
  const health = useApi(() => api.health(), []);
  const channel = health.data?.otaChannel ?? null;

  const gates = useApi<VersionGate[]>(() => api.versionGates(), []);
  const [failed, setFailed] = useState<string | null>(null);

  const [gateSheet, setGateSheet] = useState(false);
  const [gatePlatform, setGatePlatform] = useState<'ios' | 'android'>('ios');
  const [latestBuild, setLatestBuild] = useState('');
  const [latestVersionName, setLatestVersionName] = useState('');
  const [storeUrl, setStoreUrl] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const gateFor = (platform: 'ios' | 'android') =>
    gates.data?.find((gate) => gate.channel === channel && gate.platform === platform) ?? null;

  const run = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key);
    setFailed(null);
    try {
      await work();
      haptic('notificationSuccess');
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

  /** Everything the gate holds, so a save never blanks a field it did not show. */
  const keeping = (
    platform: 'ios' | 'android',
    over: Record<string, unknown>,
  ): Parameters<typeof api.setVersionGate>[0] => {
    const gate = gateFor(platform);
    return {
      platform,
      channel: channel as string,
      latestBuild: gate?.latestBuild ?? 0,
      latestVersionName: gate?.latestVersionName ?? undefined,
      storeUrl: gate?.storeUrl ?? '',
      message: gate?.message ?? undefined,
      ...over,
    } as Parameters<typeof api.setVersionGate>[0];
  };

  const editGate = (platform: 'ios' | 'android') => {
    const gate = gateFor(platform);
    setGatePlatform(platform);
    setLatestBuild(gate ? String(gate.latestBuild) : '');
    setLatestVersionName(gate?.latestVersionName ?? '');
    setStoreUrl(gate?.storeUrl ?? '');
    setMessage(gate?.message ?? '');
    setFailed(null);
    setGateSheet(true);
  };

  if (health.loading) return <Loader label="Reading the deployment" />;

  return (
    <Screen>
      <ScreenHeader
        title="Releases"
        subtitle="What the app is running, and who has it yet"
        onBack={() => navigation.goBack()}
      />

      {!channel ? (
        /*
         * The API named an environment we do not deploy, so nothing here can
         * say which channel its rows belong to. Saying so beats guessing
         * "production" and publishing into the wrong world.
         */
        <EmptyState
          icon="box"
          title="Cannot tell which world this is"
          message={`The API reports its environment as "${health.data?.env ?? 'unknown'}", which is not one we deploy. Nothing is shown rather than the wrong thing.`}
        />
      ) : (
        <>
          <View style={styles.badgeRow} testID="environment-badge">
            <Pill
              label={`${health.data?.env} · ${channel}`}
              color={channel === 'production' ? palette.danger : palette.info}
              small
            />
            <Text variant="tiny" tone="faint" style={{ flex: 1 }}>
              {channel === 'production'
                ? 'Goes to shops on the store builds.'
                : 'Goes to TestFlight and Play internal testing.'}
            </Text>
          </View>

          {failed ? (
            <Text variant="small" tone="danger" testID="release-error" style={styles.failed}>
              {failed}
            </Text>
          ) : null}

          {PLATFORMS.map((platform) => (
            <PlatformReleases
              key={platform}
              channel={channel}
              platform={platform}
              mayShip={mayShip}
              onError={setFailed}
            />
          ))}

          <Text variant="label" tone="muted" style={styles.head}>
            What the stores are serving
          </Text>

          {PLATFORMS.map((platform) => {
            const gate = gateFor(platform);
            const forcing = Boolean(
              gate && gate.latestBuild > 0 && gate.minSupportedBuild >= gate.latestBuild,
            );
            const awaitingStore = Boolean(gate && gate.latestBuild > 0 && !gate.latestIsLive);

            return (
              <View key={platform} testID={`gate-${platform}`}>
              <Card tone="dark" style={styles.card}>
                <View style={styles.row}>
                  <Text variant="small" bold style={{ flex: 1 }}>
                    {platform}
                  </Text>
                  <Pill
                    label={forcing ? 'Forcing' : 'Not forcing'}
                    color={forcing ? palette.danger : palette.surfaceLit}
                    small
                  />
                </View>

                {!gate ? (
                  <Text variant="small" tone="muted" style={styles.gap}>
                    No store build recorded. The app asks nobody to update until
                    there is one, which is the right answer until a build has
                    actually shipped.
                  </Text>
                ) : (
                  <Text variant="tiny" tone="muted" style={styles.gap}>
                    Build {gate.latestBuild}
                    {gate.latestVersionName ? ` · ${gate.latestVersionName}` : ''}
                    {' · '}
                    {awaitingStore ? 'store not serving it yet' : 'on the store'}
                    {gate.minSupportedBuild > 0
                      ? ` · below ${gate.minSupportedBuild} the app stops`
                      : ' · no build is blocked'}
                  </Text>
                )}

                {/*
                  CI records a build the moment it uploads and cannot know when
                  review ends. Until a person says the store serves it, the app
                  is told nothing — an update prompt pointing at a store page
                  that still has the old version is a button that does nothing.
                */}
                {gate && awaitingStore ? (
                  <Text variant="tiny" tone="warning" style={styles.gap}>
                    Nobody is being prompted while this is true.
                  </Text>
                ) : null}

                {mayShip ? (
                  <View style={[styles.row, styles.gap]}>
                    {gate ? (
                      <Button
                        title={gate.latestIsLive ? 'Not live after all' : 'It is on the store now'}
                        variant="dark"
                        size="sm"
                        loading={busy === `live-${platform}`}
                        onPress={() =>
                          void run(`live-${platform}`, () =>
                            api.setVersionGate(
                              keeping(platform, { latestIsLive: !gate.latestIsLive }),
                            ),
                          )
                        }
                      />
                    ) : null}
                    <Button
                      title={gate ? 'Edit' : 'Record a build'}
                      variant="dark"
                      size="sm"
                      onPress={() => editGate(platform)}
                    />
                  </View>
                ) : null}

                {mayShip && gate && gate.latestBuild > 0 ? (
                  <>
                    <Button
                      title={
                        forcing
                          ? 'Stop forcing'
                          : `Force every install below ${gate.latestBuild} to update`
                      }
                      variant={forcing ? 'dark' : 'danger'}
                      size="sm"
                      disabled={!forcing && !gate.latestIsLive}
                      loading={busy === `force-${platform}`}
                      onPress={() =>
                        void run(`force-${platform}`, () =>
                          api.setVersionGate(
                            keeping(platform, {
                              minSupportedBuild: forcing ? 0 : gate.latestBuild,
                            }),
                          ),
                        )
                      }
                      style={styles.gap}
                    />
                    <Text variant="tiny" tone="faint" style={styles.gap}>
                      {forcing
                        ? 'Every install below the newest is stopped at an update screen.'
                        : gate.latestIsLive
                          ? 'Older installs stop at an update screen until they install it.'
                          : 'Not while the store is not serving it — that is an app nobody can open, and nothing on screen to say why.'}
                    </Text>
                  </>
                ) : null}
              </Card>
              </View>
            );
          })}
        </>
      )}

      <Sheet
        visible={gateSheet}
        title="Store build"
        subtitle="What is on the store, and which binaries may still run"
        onClose={() => setGateSheet(false)}>
        <View style={styles.chips}>
          {PLATFORMS.map((one) => (
            <Chip
              key={one}
              label={one}
              selected={gatePlatform === one}
              onPress={() => setGatePlatform(one)}
            />
          ))}
        </View>
        <Field
          label="Newest build"
          placeholder="29827484"
          keyboardType="number-pad"
          value={latestBuild}
          onChangeText={setLatestBuild}
          hint="The build number, not the version. CI writes this when it uploads."
        />
        <Field
          label="Called (optional)"
          placeholder="1.2.0"
          value={latestVersionName}
          onChangeText={setLatestVersionName}
        />
        <Field
          label="Where to get it"
          placeholder="https://apps.apple.com/app/id…"
          value={storeUrl}
          onChangeText={setStoreUrl}
        />
        <Field label="What to say (optional)" value={message} onChangeText={setMessage} />
        <Button
          title="Save"
          loading={busy === 'gate'}
          disabled={!latestBuild.trim() || !storeUrl.trim()}
          onPress={() =>
            void (async () => {
              const done = await run('gate', () =>
                api.setVersionGate(
                  keeping(gatePlatform, {
                    latestBuild: Number.parseInt(latestBuild, 10),
                    latestVersionName: latestVersionName.trim() || undefined,
                    storeUrl: storeUrl.trim(),
                    message: message.trim() || undefined,
                  }),
                ),
              );
              if (done) setGateSheet(false);
            })()
          }
        />
      </Sheet>
    </Screen>
  );
}

/**
 * One platform's releases, newest first, paging on its own.
 *
 * Split by platform because they are genuinely separate queues — their own
 * live release, their own history, their own store. A single mixed list meant
 * reading the platform off every row to work out which of two numbers was the
 * one live on the phone in your hand.
 */
function PlatformReleases({
  channel,
  platform,
  mayShip,
  onError,
}: {
  channel: string;
  platform: 'ios' | 'android';
  mayShip: boolean;
  onError: (message: string | null) => void;
}) {
  const releases = usePaginated<Release>(
    (page) => api.releases({ channel, platform, page, limit: 10 }),
    [channel, platform],
  );

  const live = releases.items.find((r) => r.status === 'PUBLISHED') ?? null;

  return (
    <View testID={`slot-${platform}`} style={styles.slot}>
      <View style={styles.row}>
        <Text variant="small" bold style={{ flex: 1 }}>
          {platform}
        </Text>
        <Pill
          label={live ? `Live · OTA ${live.sequence} · ${live.rolloutPercent}%` : 'Nothing live'}
          color={live ? palette.success : palette.surfaceLit}
          small
        />
      </View>

      {releases.loading ? (
        <Loader />
      ) : releases.items.length === 0 ? (
        <Text variant="small" tone="faint" style={styles.gap}>
          Nothing published for {platform} on this channel. Releases arrive here
          from the publish robot as drafts.
        </Text>
      ) : (
        releases.items.map((release) => {
          /*
           * A release older than the live one cannot be published: installs do
           * not go backwards, so it would retire the live release on paper and
           * change nothing on any phone. The server refuses it; the ladder
           * says so before anybody taps it.
           */
          const blockedReason =
            live && release.id !== live.id && release.sequence < live.sequence
              ? `OTA ${live.sequence} is live and newer. Installs will not go backwards — roll that back instead, or publish a new release.`
              : undefined;

          return (
            <Card key={release.id} tone="dark" style={styles.card}>
              <View style={styles.row}>
                <Text variant="h3" style={{ flex: 1 }}>
                  OTA {release.sequence}
                </Text>
                {release.kind === 'ROLLBACK' ? (
                  <Pill label="Rollback" color={palette.warning} small />
                ) : null}
                <Pill label={release.status} color={STATUS_COLOR[release.status]} small />
              </View>

              <Text variant="tiny" tone="muted" style={styles.gap}>
                runtime {release.runtimeVersion} · {formatDateTime(release.createdAt)}
                {release.status === 'PUBLISHED' ? ` · ${release.rolloutPercent}% of installs` : ''}
              </Text>

              {release.changelog ? (
                <Text variant="small" tone="muted" style={styles.gap} numberOfLines={2}>
                  {release.changelog}
                </Text>
              ) : null}

              {mayShip ? (
                <ReleaseLadder
                  release={release}
                  blockedReason={blockedReason}
                  onChanged={releases.reload}
                  onError={onError}
                />
              ) : null}
            </Card>
          );
        })
      )}

      <ListFooter
        loading={releases.loadingMore}
        hasMore={releases.hasMore}
        shown={releases.items.length}
        total={releases.total}
        noun="releases"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  slot: { marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  head: { marginTop: spacing.xl, marginBottom: spacing.sm },
  gap: { marginTop: spacing.xs },
  failed: { marginBottom: spacing.md },
});

import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { DEFAULT_OTA_CHANNEL, OTA_CHANNELS } from '@fas/shared';
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
  const [channel, setChannel] = useState<string>(DEFAULT_OTA_CHANNEL);

  const releases = useApi<Release[]>(() => api.releases({ channel }), [channel]);
  const gates = useApi<VersionGate[]>(() => api.versionGates(), []);

  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const [gateSheet, setGateSheet] = useState(false);
  const [gatePlatform, setGatePlatform] = useState<'ios' | 'android'>('ios');
  const [latestBuild, setLatestBuild] = useState('');
  const [latestVersionName, setLatestVersionName] = useState('');
  const [minSupported, setMinSupported] = useState('');
  const [storeUrl, setStoreUrl] = useState('');
  const [message, setMessage] = useState('');

  /**
   * The release currently live in this one's slot, if it is a newer one.
   *
   * Publishing a draft retires whatever is live in the same channel, platform
   * and runtime — there is only ever one. When the draft is OLDER than what is
   * live, that is a downgrade wearing the word "Publish".
   */
  const supersedes = (draft: Release) =>
    releases.data?.find(
      (other) =>
        other.id !== draft.id &&
        other.status === 'PUBLISHED' &&
        other.platform === draft.platform &&
        other.runtimeVersion === draft.runtimeVersion &&
        other.sequence > draft.sequence,
    ) ?? null;

  /** Put a draft live at 5%, asking first if it would retire something newer. */
  const publishDraft = (draft: Release) => {
    const newer = supersedes(draft);
    if (!newer) {
      void change(draft, { status: 'PUBLISHED', rolloutPercent: 5 });
      return;
    }
    Alert.alert(
      `Publish OTA ${draft.sequence} and retire OTA ${newer.sequence}?`,
      `OTA ${newer.sequence} is newer and live at ${newer.rolloutPercent}%. Installs that already took it keep it — this puts an older bundle in front of new ones.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish anyway',
          style: 'destructive',
          onPress: () => void change(draft, { status: 'PUBLISHED', rolloutPercent: 5 }),
        },
      ],
    );
  };

  const gateFor = (platform: 'ios' | 'android') =>
    gates.data?.find((gate) => gate.channel === channel && gate.platform === platform);

  /** Open on what is already set, so nothing is retyped from memory. */
  const editGate = (platform: 'ios' | 'android') => {
    const gate = gateFor(platform);
    setGatePlatform(platform);
    setLatestBuild(gate ? String(gate.latestBuild) : '');
    setLatestVersionName(gate?.latestVersionName ?? '');
    setMinSupported(gate ? String(gate.minSupportedBuild) : '0');
    setStoreUrl(gate?.storeUrl ?? '');
    setMessage(gate?.message ?? '');
    setGateSheet(true);
  };

  /**
   * Say the store is serving the newest build.
   *
   * Separate from recording it on purpose: CI knows when a binary was uploaded
   * and cannot know when review finished. Until a person says so, the app is
   * told nothing — an update prompt for a build nobody can download is a
   * button that does nothing.
   */
  /**
   * Refuse every build older than the newest one.
   *
   * The heaviest thing on this screen: every install below the latest stops at
   * a blocking update screen until the person goes to the store.
   *
   * Only once the store is actually serving that build. Forcing people onto
   * something they cannot download is not an inconvenience, it is an app that
   * will not open with no way out but waiting, and nothing on screen to say
   * why.
   */
  const forceUpdate = (platform: 'ios' | 'android') => {
    const gate = gateFor(platform);
    if (!gate || !gate.latestIsLive) return;
    Alert.alert(
      `Force every ${platform} install below build ${gate.latestBuild} to update?`,
      'They will be stopped at an update screen until they install it from the store.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Force update',
          style: 'destructive',
          onPress: () =>
            void run(`force-${platform}`, () =>
              api.setVersionGate({
                platform,
                channel,
                latestBuild: gate.latestBuild,
                latestVersionName: gate.latestVersionName ?? undefined,
                minSupportedBuild: gate.latestBuild,
                storeUrl: gate.storeUrl,
                message: gate.message ?? undefined,
              }),
            ),
        },
      ],
    );
  };

  const markLive = (platform: 'ios' | 'android', live: boolean) => {
    const gate = gateFor(platform);
    if (!gate) return;
    void run(`live-${platform}`, () =>
      api.setVersionGate({
        platform,
        channel,
        latestBuild: gate.latestBuild,
        latestVersionName: gate.latestVersionName ?? undefined,
        latestIsLive: live,
        storeUrl: gate.storeUrl,
        message: gate.message ?? undefined,
      }),
    );
  };

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

  /**
   * Go back to the update this one replaced.
   *
   * Asked about first, because it is the one action here that changes what a
   * shop is running without anybody choosing the bundle they end up on.
   */
  const confirmRollback = (release: Release) => {
    Alert.alert(
      'Roll back this release?',
      'It is retired, and the update it replaced goes back to everybody at 100%.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Roll back',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              let restored: { rolledBackTo: unknown } | null = null;
              const ok = await run(release.id, async () => {
                restored = (await api.rollbackRelease(release.id)) as { rolledBackTo: unknown };
              });
              if (!ok) return;
              const wentBack = Boolean(restored && (restored as { rolledBackTo: unknown }).rolledBackTo);
              Alert.alert(
                wentBack ? 'Rolled back' : 'Retired, with nothing to go back to',
                wentBack
                  ? 'The update it replaced is live again, for everybody.'
                  : 'There was no earlier update on this channel, so the app falls back to the bundle inside the binary.',
              );
            })(),
        },
      ],
    );
  };

  return (
    <Screen refreshing={releases.refreshing} onRefresh={releases.refresh}>
      <ScreenHeader
        title="Releases"
        subtitle="What the app is running, and who has it yet"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.chips}>
        {OTA_CHANNELS.map((one) => (
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
                    {/*
                      Retire takes this bundle away and leaves whatever the
                      binary shipped with — losing every good update since, not
                      just the bad one. Roll back puts the previous update back.
                    */}
                    <Chip label="Roll back" onPress={() => confirmRollback(release)} />
                  </View>
                ) : null}
              </>
            ) : null}

            {release.status === 'DRAFT' && mayShip ? (
              <>
                {supersedes(release) ? (
                  <Text
                    variant="tiny"
                    tone="warning"
                    testID={`supersedes-${release.id}`}
                    style={{ marginTop: spacing.sm }}>
                    OTA {supersedes(release)!.sequence} is live at{' '}
                    {supersedes(release)!.rolloutPercent}% and is newer than this.
                    Publishing this one retires it, and puts an older bundle in front
                    of people — which is what Roll back on OTA{' '}
                    {supersedes(release)!.sequence} is for.
                  </Text>
                ) : null}
                <Button
                  title={
                    supersedes(release)
                      ? `Publish anyway, retiring OTA ${supersedes(release)!.sequence}`
                      : 'Publish to 5%'
                  }
                  variant={supersedes(release) ? 'dark' : undefined}
                  size="sm"
                  loading={busy === release.id}
                  onPress={() => publishDraft(release)}
                  style={{ marginTop: spacing.sm }}
                />
              </>
            ) : null}
          </Card>
        ))
      )}

      <Text variant="label" tone="muted" style={styles.head}>
        What the stores are serving
      </Text>
      {(['ios', 'android'] as const).map((platform) => {
        const gate = gateFor(platform);
        return (
          <Card key={platform} tone="dark" style={styles.card}>
            <View style={styles.row} testID={`gate-${platform}`}>
              <Text variant="small" bold style={{ flex: 1 }}>{platform}</Text>
              {gate ? (
                <Text
                  variant="tiny"
                  tone={
                    gate.minSupportedBuild >= gate.latestBuild && gate.latestBuild > 0
                      ? 'danger'
                      : 'muted'
                  }>
                  {gate.minSupportedBuild >= gate.latestBuild && gate.latestBuild > 0
                    ? 'forcing'
                    : 'not forcing'}
                </Text>
              ) : null}
              {gate ? (
                <Text variant="tiny" tone={gate.latestIsLive ? 'accent' : 'muted'}>
                  {gate.latestIsLive ? 'live on the store' : 'uploaded, not live'}
                </Text>
              ) : null}
            </View>

            {!gate ? (
              <Text variant="small" tone="muted" style={{ marginTop: spacing.xs }}>
                Nothing recorded. The app is told nothing, which is the right
                answer until a build has actually shipped.
              </Text>
            ) : (
              <>
                <Text variant="tiny" tone="muted" style={{ marginTop: spacing.xs }}>
                  Build {gate.latestBuild}
                  {gate.latestVersionName ? ` · ${gate.latestVersionName}` : ''}
                  {gate.minSupportedBuild > 0
                    ? ` · below ${gate.minSupportedBuild} the app stops`
                    : ' · no build is blocked'}
                </Text>
                {!gate.latestIsLive ? (
                  <Text variant="tiny" tone="faint" style={{ marginTop: spacing.xs }}>
                    Nobody is being offered this yet. Review has to finish first —
                    saying it is live before the store serves it leaves people
                    tapping a button that does nothing.
                  </Text>
                ) : null}
              </>
            )}

            {mayShip ? (
              <View style={[styles.row, { marginTop: spacing.sm }]}>
                {gate ? (
                  <Button
                    title={gate.latestIsLive ? 'Not live after all' : 'It is live now'}
                    variant="dark"
                    loading={busy === `live-${platform}`}
                    onPress={() => markLive(platform, !gate.latestIsLive)}
                  />
                ) : null}
                <Button
                  title={gate ? 'Edit' : 'Record a build'}
                  variant="dark"
                  onPress={() => editGate(platform)}
                />
              </View>
            ) : null}

            {mayShip && gate && gate.minSupportedBuild < gate.latestBuild ? (
              <>
                <Button
                  title={`Force every install below ${gate.latestBuild} to update`}
                  variant="danger"
                  size="sm"
                  disabled={!gate.latestIsLive}
                  loading={busy === `force-${platform}`}
                  onPress={() => forceUpdate(platform)}
                  style={{ marginTop: spacing.sm }}
                />
                <Text variant="tiny" tone="faint" style={{ marginTop: spacing.xs }}>
                  {gate.latestIsLive
                    ? 'Older installs stop at an update screen until they install it.'
                    : 'Not while the store is not serving it — that would be an app nobody can open and no way to say why.'}
                </Text>
              </>
            ) : null}
          </Card>
        );
      })}

      <Sheet
        visible={gateSheet}
        title="Store build"
        subtitle="What is on the store, and which binaries may still run"
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
          label="Stop below build"
          placeholder="0"
          keyboardType="number-pad"
          value={minSupported}
          onChangeText={setMinSupported}
          hint="Older binaries are refused. Leave at 0 unless an old app would break."
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
                api.setVersionGate({
                  platform: gatePlatform,
                  channel,
                  latestBuild: Number.parseInt(latestBuild, 10),
                  latestVersionName: latestVersionName.trim() || undefined,
                  minSupportedBuild: Number.parseInt(minSupported || '0', 10),
                  storeUrl: storeUrl.trim(),
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

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Release, ReleaseStatus, VersionGate } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Loader,
  PageHead,
  Pill,
  SectionHead,
  Sheet,
} from '@/ui';
import { formatDateTime } from '@/lib/format';

const STATUS_COLOR: Record<ReleaseStatus, string> = {
  DRAFT: 'var(--surface-lit)',
  PUBLISHED: 'var(--success)',
  ARCHIVED: 'var(--text-faint)',
};

/** The steps a rollout is walked up in. Small enough to stop at. */
const STEPS = [0, 5, 10, 25, 50, 100];

/**
 * What the app is running, and who has it yet.
 *
 * A release is uploaded as a draft by the publish script, looked at here, then
 * put in front of a few people and walked up. The percentage is sticky per
 * install, so raising it only ever adds people — which is what makes it safe to
 * stop halfway and think.
 *
 * Not a tenant screen: there is one app in the stores for every workspace.
 */
export default function ReleasesPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user && !user.isPlatform) router.replace('/');
  }, [loading, user, router]);

  const [channel, setChannel] = useState('production');
  const releases = useApi<Release[]>(() => api.releases({ channel }), [channel]);
  const gates = useApi<VersionGate[]>(() => api.versionGates(), []);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [gateSheet, setGateSheet] = useState(false);
  const [gatePlatform, setGatePlatform] = useState<'ios' | 'android'>('ios');
  const [latestBuild, setLatestBuild] = useState('');
  const [latestVersionName, setLatestVersionName] = useState('');
  const [minSupported, setMinSupported] = useState('');
  const [storeUrl, setStoreUrl] = useState('');
  const [message, setMessage] = useState('');

  const change = async (
    release: Release,
    body: { status?: ReleaseStatus; rolloutPercent?: number },
  ) => {
    setBusy(release.id);
    setError(null);
    try {
      await api.updateRelease(release.id, body);
      releases.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the release');
    } finally {
      setBusy(null);
    }
  };

  const gateFor = (platform: 'ios' | 'android') =>
    gates.data?.find((gate) => gate.channel === channel && gate.platform === platform);

  /** Open the sheet on what is already set, so nothing is retyped from memory. */
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

  const saveGate = async () => {
    setBusy('gate');
    setError(null);
    try {
      await api.setVersionGate({
        platform: gatePlatform,
        channel,
        latestBuild: Number.parseInt(latestBuild, 10),
        latestVersionName: latestVersionName.trim() || undefined,
        minSupportedBuild: Number.parseInt(minSupported || '0', 10),
        storeUrl: storeUrl.trim(),
        message: message.trim() || undefined,
      });
      setGateSheet(false);
      gates.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set the gate');
    } finally {
      setBusy(null);
    }
  };

  /**
   * Say that the store is now serving the newest build.
   *
   * Deliberately separate from recording it. CI knows when a binary was
   * uploaded and cannot know when review finished, so until a person says so
   * the app is told nothing — an update prompt for a build that cannot be
   * downloaded is a button that does nothing, over and over.
   */
  const markLive = async (platform: 'ios' | 'android', live: boolean) => {
    const gate = gateFor(platform);
    if (!gate) return;
    setBusy(`live-${platform}`);
    setError(null);
    try {
      await api.setVersionGate({
        platform,
        channel,
        latestBuild: gate.latestBuild,
        latestVersionName: gate.latestVersionName ?? undefined,
        latestIsLive: live,
        storeUrl: gate.storeUrl,
        message: gate.message ?? undefined,
      });
      gates.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the store state');
    } finally {
      setBusy(null);
    }
  };

  if (loading || !user) return <Loader />;

  return (
    <div className="shell-main" style={{ margin: '0 auto' }}>
      <PageHead
        title="Releases"
        subtitle="What the app is running, and who has it yet"
        action={
          <div className="row">
            <Button title="Store builds" variant="ghost" onClick={() => editGate('ios')} />
            <Button title="Workspaces" variant="ghost" onClick={() => router.push('/platform/tenants')} />
          </div>
        }
      />

      <div className="wrap" style={{ marginBottom: 'var(--s-lg)' }}>
        {['production', 'staging'].map((one) => (
          <Chip
            key={one}
            label={one}
            selected={channel === one}
            onClick={() => setChannel(one)}
          />
        ))}
      </div>

      {error ? <p className="t-small danger">{error}</p> : null}

      {releases.loading ? (
        <Loader />
      ) : (releases.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon="box"
          title="Nothing published on this channel"
          message="Releases arrive from the publish script as drafts."
        />
      ) : (
        <div className="stack-sm">
          {releases.data?.map((release) => (
            <Card key={release.id} size="sm">
              <div className="row-between">
                <div style={{ minWidth: 0 }}>
                  <div className="t-h3">
                    OTA {release.sequence} · {release.platform}
                  </div>
                  <div className="t-tiny muted">
                    runtime {release.runtimeVersion} · {formatDateTime(release.createdAt)}
                    {release._count ? ` · ${release._count.assets} files` : ''}
                  </div>
                </div>
                <div className="row">
                  {release.kind === 'ROLLBACK' ? (
                    <Pill label="Rollback" color="var(--warning)" />
                  ) : null}
                  <Pill label={release.status} color={STATUS_COLOR[release.status]} />
                </div>
              </div>

              {release.changelog ? (
                <p className="t-small muted" style={{ marginTop: 'var(--s-sm)' }}>
                  {release.changelog}
                </p>
              ) : null}

              {release.status === 'PUBLISHED' ? (
                <>
                  <div className="track" style={{ marginTop: 'var(--s-md)' }}>
                    <div className="track-fill" style={{ width: `${release.rolloutPercent}%` }} />
                  </div>
                  <div className="row-between" style={{ marginTop: 'var(--s-sm)' }}>
                    <span className="t-tiny muted">{release.rolloutPercent}% of installs</span>
                    <div className="wrap">
                      {/* Sticky buckets mean walking this up only ever adds
                          people, so the steps are safe to stop between. */}
                      {STEPS.filter((step) => step > release.rolloutPercent).map((step) => (
                        <Chip
                          key={step}
                          label={`${step}%`}
                          onClick={() => change(release, { rolloutPercent: step })}
                        />
                      ))}
                      <Chip
                        label="Retire"
                        onClick={() => change(release, { status: 'ARCHIVED' })}
                      />
                    </div>
                  </div>
                </>
              ) : null}

              {release.status === 'DRAFT' ? (
                <div className="row-right" style={{ marginTop: 'var(--s-md)' }}>
                  <Button
                    title="Publish to 5%"
                    loading={busy === release.id}
                    onClick={() => change(release, { status: 'PUBLISHED', rolloutPercent: 5 })}
                  />
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <SectionHead title="What the stores are serving" />
      <div className="stack-sm" data-testid="version-gates">
        {(['ios', 'android'] as const).map((platform) => {
          const gate = gateFor(platform);
          return (
            <Card key={platform} size="sm">
              <div className="row-between">
                <span className="t-small bold">{platform}</span>
                {gate ? (
                  <Pill
                    label={gate.latestIsLive ? 'live on the store' : 'uploaded, not live'}
                    color={gate.latestIsLive ? 'var(--success)' : 'var(--warning)'}
                  />
                ) : null}
              </div>

              {!gate ? (
                <p className="t-small faint" style={{ marginTop: 'var(--s-xs)' }}>
                  Nothing recorded. The app is told nothing, which is the right
                  answer until a build has actually shipped.
                </p>
              ) : (
                <>
                  <p className="t-tiny muted" style={{ marginTop: 'var(--s-xs)' }}>
                    Build {gate.latestBuild}
                    {gate.latestVersionName ? ` · ${gate.latestVersionName}` : ''}
                    {gate.minSupportedBuild > 0
                      ? ` · below ${gate.minSupportedBuild} the app stops`
                      : ' · no build is blocked'}
                  </p>
                  {!gate.latestIsLive ? (
                    <p className="t-tiny faint" style={{ marginTop: 'var(--s-xs)' }}>
                      Nobody is being offered this yet. Review has to finish
                      first — saying it is live before the store serves it
                      leaves people tapping a button that does nothing.
                    </p>
                  ) : null}
                  <div className="row" style={{ marginTop: 'var(--s-sm)' }}>
                    <Button
                      title={gate.latestIsLive ? 'Not live after all' : 'It is live now'}
                      variant="ghost"
                      loading={busy === `live-${platform}`}
                      onClick={() => void markLive(platform, !gate.latestIsLive)}
                    />
                    <Button title="Edit" variant="ghost" onClick={() => editGate(platform)} />
                  </div>
                </>
              )}
              {!gate ? (
                <Button
                  title="Record a build"
                  variant="ghost"
                  onClick={() => editGate(platform)}
                />
              ) : null}
            </Card>
          );
        })}
      </div>

      <Sheet
        open={gateSheet}
        title="Store build"
        subtitle="What is on the store, and which binaries may still run"
        onClose={() => setGateSheet(false)}>
        <div className="wrap" style={{ marginBottom: 'var(--s-lg)' }}>
          {(['ios', 'android'] as const).map((one) => (
            <Chip
              key={one}
              label={one}
              selected={gatePlatform === one}
              onClick={() => setGatePlatform(one)}
            />
          ))}
        </div>
        <Field
          label="Newest build"
          placeholder="29827484"
          value={latestBuild}
          onChange={setLatestBuild}
          hint="The build number, not the version. CI writes this when it uploads."
        />
        <Field
          label="Called (optional)"
          placeholder="1.2.0"
          value={latestVersionName}
          onChange={setLatestVersionName}
        />
        <Field
          label="Stop below build"
          placeholder="0"
          value={minSupported}
          onChange={setMinSupported}
          hint="Older binaries are refused. Leave at 0 unless an old app would break."
        />
        <Field
          label="Where to get it"
          placeholder="https://apps.apple.com/app/id…"
          value={storeUrl}
          onChange={setStoreUrl}
        />
        <Field label="What to say (optional)" value={message} onChange={setMessage} />
        {error ? <p className="t-small danger">{error}</p> : null}
        <Button
          title="Save"
          block
          loading={busy === 'gate'}
          disabled={!latestBuild.trim() || !storeUrl.trim()}
          onClick={saveGate}
        />
      </Sheet>
    </div>
  );
}

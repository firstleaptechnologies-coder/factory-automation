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
  const [minimum, setMinimum] = useState('');
  const [recommended, setRecommended] = useState('');
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

  const saveGate = async () => {
    setBusy('gate');
    setError(null);
    try {
      await api.setVersionGate({
        platform: gatePlatform,
        channel,
        minimumVersion: minimum.trim(),
        recommendedVersion: recommended.trim() || undefined,
        message: message.trim() || undefined,
      });
      setGateSheet(false);
      gates.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set the floor');
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
            <Button title="Version floor" variant="ghost" onClick={() => setGateSheet(true)} />
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

      <SectionHead title="Version floor" />
      <Card size="sm">
        {(gates.data?.filter((gate) => gate.channel === channel).length ?? 0) === 0 ? (
          <p className="t-small faint">
            No floor set. Every binary is allowed to run whatever it can fetch.
          </p>
        ) : (
          <div className="stack-sm">
            {gates.data
              ?.filter((gate) => gate.channel === channel)
              .map((gate) => (
                <div key={gate.id} className="row-between">
                  <span className="t-small bold">{gate.platform}</span>
                  <span className="t-tiny muted">
                    must be {gate.minimumVersion}
                    {gate.recommendedVersion ? ` · asked for ${gate.recommendedVersion}` : ''}
                  </span>
                </div>
              ))}
          </div>
        )}
      </Card>

      <Sheet
        open={gateSheet}
        title="Version floor"
        subtitle="For changes an update cannot carry — a native module, a permission"
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
          label="Must be at least"
          placeholder="1.2.0"
          value={minimum}
          onChange={setMinimum}
          hint="Below this the app stops and says it has to be updated."
        />
        <Field
          label="Ask for (optional)"
          placeholder="1.4.0"
          value={recommended}
          onChange={setRecommended}
        />
        <Field label="What to say (optional)" value={message} onChange={setMessage} />
        {error ? <p className="t-small danger">{error}</p> : null}
        <Button
          title="Set the floor"
          block
          loading={busy === 'gate'}
          disabled={!minimum.trim()}
          onClick={saveGate}
        />
      </Sheet>
    </div>
  );
}

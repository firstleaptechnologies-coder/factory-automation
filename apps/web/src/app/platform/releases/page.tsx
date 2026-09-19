'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VersionGate } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Button, Card, Loader, PageHead, Pill, SectionHead } from '@/ui';
import { Shell } from '@/components/Shell';
import { GateCard } from './gate-card';
import { SlotCard } from './slot-card';

const PLATFORMS = ['ios', 'android'] as const;

/**
 * What the app is running, and who has it yet.
 *
 * A release arrives here as a draft from the publish robot, gets looked at,
 * then goes in front of a fifth of installs and is walked up. The percentage
 * is sticky per install, so raising it only ever adds people — which is what
 * makes it safe to stop halfway and think.
 *
 * There is no channel picker, and that is the point. Each deployment has its
 * own database holding only its own channel: the staging API serves
 * `development`, which TestFlight and Play-internal builds carry, and the
 * production API serves `production`. A picker would have offered one real
 * list and one permanently empty one, and invited somebody to record a store
 * build against a channel this deployment can never serve. It offered
 * "staging" once, which no binary has ever asked for.
 *
 * Not a tenant screen: there is one app in the stores for every workspace.
 */
export default function ReleasesPage() {
  return (
    <Shell>
      <Releases />
    </Shell>
  );
}

function Releases() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user && !user.isPlatform) router.replace('/');
  }, [loading, user, router]);

  // The API says which deployment it is and therefore which channel it
  // manages. Asked rather than assumed: the web and the API are deployed
  // separately, and a build-time guess is exactly how a staging screen starts
  // writing production rows.
  const health = useApi(() => api.health(), []);
  const channel = health.data?.otaChannel ?? null;

  const gates = useApi<VersionGate[]>(() => api.versionGates(), []);
  const [error, setError] = useState<string | null>(null);

  if (loading || !user) return <Loader />;

  return (
    <div className="shell-main" style={{ margin: '0 auto' }}>
      <PageHead
        title="Releases"
        subtitle="What the app is running, and who has it yet"
        action={
          <div className="row">
            <Button
              title="How a release works"
              variant="ghost"
              onClick={() => router.push('/platform/releases/flow')}
            />
            <Button
              title="Workspaces"
              variant="ghost"
              onClick={() => router.push('/platform/tenants')}
            />
          </div>
        }
      />

      {health.loading ? (
        <Loader />
      ) : !channel ? (
        /*
         * The API named an environment we do not deploy, so we do not know
         * which channel its rows belong to. Saying so beats guessing
         * "production" and publishing into the wrong world.
         */
        <Card size="sm">
          <p className="t-small danger">
            This API reports its environment as{' '}
            <strong>{health.data?.env ?? 'unknown'}</strong>, which is not one of
            the deployments in <code>deploy/environments.json</code>. Until that
            is fixed there is no way to tell which OTA channel these releases
            belong to, so nothing is shown rather than the wrong thing.
          </p>
        </Card>
      ) : (
        <>
          <div className="row" style={{ gap: 'var(--s-sm)', marginBottom: 'var(--s-lg)' }}>
            <Pill
              label={`${health.data?.env} · ${channel} channel`}
              color={channel === 'production' ? 'var(--danger)' : 'var(--info)'}
            />
            <span className="t-tiny muted">
              {channel === 'production'
                ? 'These go to shops running the App Store and Play builds.'
                : 'These go to TestFlight and Play internal testing.'}
            </span>
          </div>

          {error ? (
            <Card size="sm">
              <p className="t-small danger" data-testid="release-error">
                {error}
              </p>
            </Card>
          ) : null}

          <div className="stack-sm">
            {PLATFORMS.map((platform) => (
              <SlotCard
                key={platform}
                channel={channel}
                platform={platform}
                onError={setError}
              />
            ))}
          </div>

          <SectionHead title="What the stores are serving" />
          <p className="t-small muted" style={{ marginTop: -8, marginBottom: 'var(--s-md)' }}>
            This drives the store-update prompt and the blocking update screen.
            Raising the oldest allowed build stops every older install from
            opening the app, so only do it once the store really serves the new
            one.
          </p>

          <div className="stack-sm" data-testid="version-gates">
            {PLATFORMS.map((platform) => (
              <GateCard
                key={platform}
                channel={channel}
                platform={platform}
                gate={
                  gates.data?.find((g) => g.channel === channel && g.platform === platform) ?? null
                }
                onSaved={gates.reload}
                onError={setError}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

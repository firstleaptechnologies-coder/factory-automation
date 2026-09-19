'use client';

import { useState } from 'react';
import type { VersionGate } from '@fas/shared';
import { api } from '@/lib/api';
import { Button, Card, Field, Pill } from '@/ui';

/**
 * What the stores are serving, and what is still allowed to run.
 *
 * This was behind a modal, which is the wrong shape for it: the numbers are
 * something you read far more often than you change, and a modal hides them
 * until you are already editing. Inline, the state is the default view and
 * editing is the thing you opt into.
 */
export function GateCard({
  channel,
  platform,
  gate,
  onSaved,
  onError,
}: {
  channel: string;
  platform: 'ios' | 'android';
  gate: VersionGate | null;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [latestBuild, setLatestBuild] = useState(gate ? String(gate.latestBuild) : '');
  const [latestVersionName, setLatestVersionName] = useState(gate?.latestVersionName ?? '');
  const [storeUrl, setStoreUrl] = useState(gate?.storeUrl ?? '');
  const [message, setMessage] = useState(gate?.message ?? '');

  // Nobody is forced while the minimum sits below the newest build.
  const forcing = Boolean(gate && gate.latestBuild > 0 && gate.minSupportedBuild >= gate.latestBuild);
  // Uploaded but not downloadable yet. The app is told nothing until it clears.
  const awaitingStore = Boolean(gate && gate.latestBuild > 0 && !gate.latestIsLive);

  const open = () => {
    setLatestBuild(gate ? String(gate.latestBuild) : '');
    setLatestVersionName(gate?.latestVersionName ?? '');
    setStoreUrl(gate?.storeUrl ?? '');
    setMessage(gate?.message ?? '');
    onError(null);
    setEditing(true);
  };

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    onError(null);
    try {
      await work();
      setEditing(false);
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not change the gate');
    } finally {
      setBusy(false);
    }
  };

  /** Everything the gate holds, so a save never blanks a field it did not show. */
  const keeping = (over: Partial<Parameters<typeof api.setVersionGate>[0]>) => ({
    platform,
    channel,
    latestBuild: gate?.latestBuild ?? 0,
    latestVersionName: gate?.latestVersionName ?? undefined,
    storeUrl: gate?.storeUrl ?? '',
    message: gate?.message ?? undefined,
    ...over,
  });

  const save = () => {
    const build = Number.parseInt(latestBuild, 10);
    if (!Number.isFinite(build) || build < 0) return onError('Enter the build number');
    if (!storeUrl.trim()) return onError('The store link is what the update screen sends people to');
    return run(() =>
      api.setVersionGate(
        keeping({
          latestBuild: build,
          latestVersionName: latestVersionName.trim() || undefined,
          storeUrl: storeUrl.trim(),
          message: message.trim() || undefined,
        }),
      ),
    );
  };

  const force = () => {
    if (!gate?.latestIsLive) return;
    if (
      !window.confirm(
        `Force every ${platform} install below build ${gate.latestBuild} to update?\n\n` +
          'They are stopped at an update screen until they install it from the store.',
      )
    ) {
      return;
    }
    return run(() => api.setVersionGate(keeping({ minSupportedBuild: gate.latestBuild })));
  };

  const unforce = () => {
    if (!window.confirm('Stop forcing? Nobody will be blocked from opening the app.')) return;
    return run(() => api.setVersionGate(keeping({ minSupportedBuild: 0 })));
  };

  const markLive = (live: boolean) =>
    run(() => api.setVersionGate(keeping({ latestIsLive: live })));

  return (
    <Card size="sm" testId={`gate-${platform}`}>
      <div className="row-between">
        <div className="row" style={{ gap: 'var(--s-sm)' }}>
          <span className="t-body bold" style={{ textTransform: 'capitalize' }}>
            {platform}
          </span>
          <Pill
            label={forcing ? 'Forcing' : 'Not forcing'}
            color={forcing ? 'var(--danger)' : 'var(--text-faint)'}
          />
        </div>
        {!editing ? (
          <Button title={gate ? 'Edit' : 'Record a build'} variant="ghost" size="sm" onClick={open} />
        ) : null}
      </div>

      {gate && !editing ? (
        <>
          <dl className="gate-facts">
            <div>
              <dt className="t-tiny muted">Newest build</dt>
              <dd className="t-small bold">
                {gate.latestBuild}
                {gate.latestVersionName ? (
                  <span className="t-tiny faint"> ({gate.latestVersionName})</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="t-tiny muted">On the store</dt>
              <dd className={`t-small bold ${awaitingStore ? 'warning' : 'success'}`}>
                {awaitingStore ? 'Not yet' : 'Serving'}
              </dd>
            </div>
            <div>
              <dt className="t-tiny muted">Oldest allowed</dt>
              <dd className={`t-small bold ${forcing ? 'danger' : ''}`}>
                {gate.minSupportedBuild || 'Any'}
              </dd>
            </div>
          </dl>

          {/*
            CI records a build the moment it is uploaded and cannot know when
            review ends. Until somebody says the store is serving it, the app
            is told nothing — an update prompt pointing at a store page that
            still has the old version is a button that does nothing, forever.
          */}
          {awaitingStore ? (
            <div className="gate-banner">
              <p className="t-small bold warning">
                Build {gate.latestBuild} is uploaded but the store is not serving it
              </p>
              <p className="t-tiny muted">
                Nobody is being prompted to update while this is true.
              </p>
              <Button
                title="It is on the store now"
                size="sm"
                loading={busy}
                onClick={() => markLive(true)}
              />
            </div>
          ) : gate.latestBuild > 0 ? (
            <button
              type="button"
              className="link-btn t-tiny"
              disabled={busy}
              onClick={() => markLive(false)}>
              Mark as not on the store yet — stops update prompts
            </button>
          ) : null}

          <div className="row" style={{ gap: 'var(--s-sm)', marginTop: 'var(--s-md)' }}>
            {forcing ? (
              <Button title="Stop forcing" variant="ghost" size="sm" loading={busy} onClick={unforce} />
            ) : (
              <Button
                title="Force everyone onto it"
                variant="danger"
                size="sm"
                loading={busy}
                disabled={!gate.latestIsLive || gate.latestBuild === 0}
                onClick={force}
              />
            )}
          </div>
          {!gate.latestIsLive && gate.latestBuild > 0 && !forcing ? (
            <p className="t-tiny faint" style={{ marginTop: 6 }}>
              Forcing is off until the store serves this build — locking people out
              of an app they cannot update is an app that will not open.
            </p>
          ) : null}
        </>
      ) : null}

      {!gate && !editing ? (
        <p className="t-small muted" style={{ marginTop: 'var(--s-sm)' }}>
          No store build recorded for {platform}. The app asks nobody to update
          until there is one.
        </p>
      ) : null}

      {editing ? (
        <div className="gate-form">
          <Field label="Newest build number" value={latestBuild} onChange={setLatestBuild} />
          <Field
            label="Version name"
            placeholder="1.0.1"
            value={latestVersionName}
            onChange={setLatestVersionName}
          />
          <Field
            label="Store link"
            placeholder="https://apps.apple.com/…"
            value={storeUrl}
            onChange={setStoreUrl}
          />
          <Field
            label="What the update screen says"
            placeholder="Optional"
            value={message}
            onChange={setMessage}
          />
          <div className="row" style={{ gap: 'var(--s-sm)' }}>
            <Button title="Save" size="sm" loading={busy} onClick={save} />
            <Button
              title="Cancel"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                onError(null);
              }}
            />
          </div>
        </div>
      ) : null}
    </Card>
  );
}

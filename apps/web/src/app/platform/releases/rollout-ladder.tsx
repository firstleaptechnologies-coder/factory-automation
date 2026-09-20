'use client';

import { useState } from 'react';
import { ROLLOUT_STEPS, type Release } from '@fas/shared';
import { api } from '@/lib/api';
import { Icon } from '@/ui';

/**
 * Everything one release can have done to it.
 *
 * One control does the publishing, whatever state the release is in: a draft
 * goes live at the rung you press, a live release moves to it. Same ladder
 * either way, so it does not change shape under your finger the moment a
 * release goes live — which is exactly when you are watching it most closely.
 */
export function RolloutLadder({
  release,
  onChanged,
  onError,
  /**
   * Set when this release must not be published — it is older than the one
   * that is live. The reason is the tooltip, because a control that is
   * disabled without saying why is indistinguishable from one that is broken.
   */
  blockedReason,
}: {
  release: Release;
  onChanged: () => void;
  onError: (message: string | null) => void;
  blockedReason?: string;
}) {
  // Which rung is mid-flight, so only that one spins. `null` means a
  // secondary action is running instead.
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
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'That did not go through');
    } finally {
      setBusyStep(null);
      setPending(false);
    }
  };

  // One tap, one decision. A draft publishes at this percent; a live release
  // just moves to it.
  const goTo = (percent: number) =>
    run(percent, () =>
      api.updateRelease(release.id, {
        ...(live ? {} : { status: 'PUBLISHED' as const }),
        rolloutPercent: percent,
      }),
    );

  const rollback = () => {
    if (
      !window.confirm(
        'Roll back this release?\n\nIt is retired, and the update it replaced goes back to everybody at 100%.',
      )
    ) {
      return;
    }
    return run(null, async () => {
      const { rolledBackTo } = await api.rollbackRelease(release.id);
      if (!rolledBackTo) {
        onError(
          'Retired. There was no earlier update on this channel, so the app falls back to the bundle inside the binary.',
        );
      }
    });
  };

  const archive = () => {
    if (!window.confirm('Archive this release? It will never be served again.')) return;
    return run(null, () => api.updateRelease(release.id, { status: 'ARCHIVED' }));
  };

  /*
   * Nothing can be published here, so nothing offers to.
   *
   * A dimmed ladder plus a sentence of explanation on every superseded
   * release is four identical paragraphs down a page whose whole job is to
   * show you the one release that matters. The rungs were never pressable;
   * showing them greyed out just made the page long enough to hide the live
   * one off the top.
   */
  if (blocked) {
    return (
      <div className="ladder">
        <p className="t-tiny faint ladder-note">{blockedReason}</p>
        {release.status !== 'ARCHIVED' ? (
          <div className="ladder-secondary">
            <button
              type="button"
              disabled={pending}
              onClick={archive}
              className="mini-btn mini-btn-danger">
              <Icon name="box" size={13} />
              Archive
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="ladder">
      <div className="ladder-row">
        <span
          className="t-tiny muted ladder-label"
          title={
            live
              ? 'Move this live release to a different share of installs.'
              : 'Put this release in front of a share of installs.'
          }>
          <Icon name="arrowUpRight" size={13} />
          {live ? 'Now at' : 'Publish at'}
        </span>

        <div className="ladder-track" role="group" aria-label="Rollout percentage">
          {ROLLOUT_STEPS.map((step) => {
            const current = live && release.rolloutPercent === step;
            // Rungs already passed read as filled, so the track shows how far
            // this release has travelled without anybody reading a number.
            const passed = live && release.rolloutPercent > step;
            return (
              <button
                key={step}
                type="button"
                disabled={pending || blocked || current}
                title={
                  blocked
                    ? blockedReason
                    : current
                      ? `Already at ${step}%`
                      : live
                        ? `Move the rollout to ${step}%`
                        : `Publish at ${step}%`
                }
                onClick={() => goTo(step)}
                className={`rung${current ? ' rung-here' : ''}${passed ? ' rung-passed' : ''}`}>
                {busyStep === step ? <span className="spinner spinner-xs" /> : null}
                {step}%
              </button>
            );
          })}
        </div>
      </div>


      {/*
        Pausing, reverting and retiring are different in kind from walking the
        ladder up, so they sit on their own line. Putting them in the same row
        is an invitation to mis-click the one that cannot be undone.
      */}
      <div className="ladder-secondary">
        {live && release.rolloutPercent !== 0 ? (
          <button
            type="button"
            disabled={pending}
            title="Stop serving this to new installs. Anyone who already took it keeps it — use Roll back to undo that."
            onClick={() => goTo(0)}
            className="mini-btn">
            {busyStep === 0 ? <span className="spinner spinner-xs" /> : null}
            Pause
          </button>
        ) : null}

        {live && release.rolloutPercent === 0 ? (
          <span className="mini-btn is-static">Paused — serving nobody</span>
        ) : null}

        {live ? (
          <button
            type="button"
            disabled={pending}
            onClick={rollback}
            className="mini-btn mini-btn-warning">
            <Icon name="history" size={13} />
            Roll back
          </button>
        ) : null}

        {release.status !== 'ARCHIVED' ? (
          <button
            type="button"
            disabled={pending}
            onClick={archive}
            className="mini-btn mini-btn-danger">
            <Icon name="box" size={13} />
            Archive
          </button>
        ) : null}
      </div>
    </div>
  );
}

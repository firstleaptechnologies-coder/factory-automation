'use client';

import type { Release, ReleaseStatus } from '@fas/shared';
import { api } from '@/lib/api';
import { usePaginated } from '@/lib/usePaginated';
import { Card, Icon, ListFooter, Loader, Pill } from '@/ui';
import { formatDateTime } from '@/lib/format';
import { RolloutLadder } from './rollout-ladder';

const STATUS_COLOR: Record<ReleaseStatus, string> = {
  DRAFT: 'var(--surface-lit)',
  PUBLISHED: 'var(--success)',
  ARCHIVED: 'var(--text-faint)',
};

/** How far along a live release is, without anybody reading a number. */
function RolloutBar({ percent }: { percent: number }) {
  return (
    <span className="rollout-bar" aria-hidden>
      <span
        className="rollout-bar-fill"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </span>
  );
}

/**
 * One platform's releases, newest first.
 *
 * Split by platform rather than listed together because they are genuinely
 * separate queues: iOS and Android have their own live release, their own
 * history and their own store. A single mixed list made you read the platform
 * off every row to work out which of two numbers was the one live on the
 * phone in your hand.
 *
 * Each card pages on its own, so a channel that has published for a year does
 * not bury the other platform under it.
 */
export function SlotCard({
  channel,
  platform,
  onError,
}: {
  channel: string;
  platform: 'ios' | 'android';
  onError: (message: string | null) => void;
}) {
  const releases = usePaginated<Release>(
    (page) => api.releases({ channel, platform, page, limit: 10 }),
    [channel, platform],
  );

  const live = releases.items.find((r) => r.status === 'PUBLISHED') ?? null;

  return (
    <Card size="sm" testId={`slot-${platform}`}>
      <div className="row-between slot-head">
        <div className="row" style={{ gap: 'var(--s-sm)', minWidth: 0 }}>
          <span className="t-body bold" style={{ textTransform: 'capitalize' }}>
            {platform}
          </span>
          {live ? (
            <Pill
              label={`Live · OTA ${live.sequence} · ${live.rolloutPercent}%`}
              color="var(--success)"
            />
          ) : (
            <Pill label="Nothing live" color="var(--text-faint)" />
          )}
        </div>
        <span className="t-tiny muted">
          {releases.total} release{releases.total === 1 ? '' : 's'}
        </span>
      </div>

      {releases.loading ? (
        <Loader />
      ) : releases.items.length === 0 ? (
        <div className="slot-empty">
          <Icon name="box" size={22} color="var(--text-faint)" />
          <p className="t-small muted" style={{ marginTop: 6 }}>
            Nothing has been published for {platform} on this channel. Releases
            arrive here from the publish robot as drafts.
          </p>
        </div>
      ) : (
        <ul className="slot-list">
          {releases.items.map((release) => {
            /*
             * A release older than the live one cannot be published: devices
             * will not go backwards, so it would retire the live release on
             * paper and change nothing on any phone. The server refuses it;
             * the ladder says so before anybody presses it.
             *
             * Newest-first ordering plus pages loaded top-down means anything
             * that could block a release on screen is already on screen.
             */
            const blockedReason =
              live && release.id !== live.id && release.sequence < live.sequence
                ? `OTA ${live.sequence} is live and newer. Installs will not go backwards — roll that back instead, or publish a new release.`
                : undefined;

            return (
              <li key={release.id} className="slot-row">
                <div className="row slot-row-head">
                  <span className="t-body bold">OTA {release.sequence}</span>
                  <Pill label={release.status} color={STATUS_COLOR[release.status]} />
                  {release.kind === 'ROLLBACK' ? (
                    <Pill label="Rollback" color="var(--warning)" />
                  ) : null}
                  {release.status === 'PUBLISHED' ? (
                    <span className="row" style={{ gap: 6 }}>
                      <RolloutBar percent={release.rolloutPercent} />
                      <span className="t-tiny muted tabular">{release.rolloutPercent}%</span>
                    </span>
                  ) : null}
                  <span className="t-tiny faint slot-row-meta">
                    runtime {release.runtimeVersion} · {formatDateTime(release.createdAt)}
                    {release._count ? ` · ${release._count.assets} files` : ''}
                  </span>
                </div>

                {release.changelog ? (
                  <p className="t-small muted slot-changelog">{release.changelog}</p>
                ) : null}

                <RolloutLadder
                  release={release}
                  blockedReason={blockedReason}
                  onChanged={releases.reload}
                  onError={onError}
                />
              </li>
            );
          })}
        </ul>
      )}

      <ListFooter
        loading={releases.loadingMore}
        hasMore={releases.hasMore}
        shown={releases.items.length}
        total={releases.total}
        noun="releases"
        onMore={releases.loadMore}
      />
    </Card>
  );
}

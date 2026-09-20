import { ReleasesService, olderVersion } from './releases.service';
import { prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build(release: unknown = null) {
  const db = prismaMock() as never as Db;
  db.otaRelease.findFirst = jest.fn(async () => null);
  db.otaRelease.findUnique = jest.fn(async () => release);
  db.otaRelease.create = jest.fn(async ({ data }: { data: unknown }) => data);
  db.otaRelease.update = jest.fn(async ({ data }: { data: unknown }) => data);
  const ota = {
    addAsset: jest.fn(async (..._args: unknown[]) => ({ id: 'a1', key: 'k', byteSize: 10 })),
  };
  return { service: new ReleasesService(db as never, ota as never), db, ota };
}

const draft = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  channel: 'production',
  platform: 'ios',
  runtimeVersion: '1.0.0',
  status: 'DRAFT',
  kind: 'UPDATE',
  activatedAt: null,
  assets: [{ isLaunchAsset: true }],
  ...over,
});

const create = {
  channel: 'production',
  runtimeVersion: '1.0.0',
  platform: 'ios' as never,
};

describe('creating a release', () => {
  it('numbers it after the last one on the same runtime', async () => {
    const { service, db } = build();
    db.otaRelease.findFirst = jest.fn(async () => ({ sequence: 6 }));

    const created = (await service.create(create)) as unknown as { sequence: number };

    // Shown in the app as "OTA 7", so nobody has to read a UUID aloud.
    expect(created.sequence).toBe(7);
  });

  it('starts at one where there is nothing before it', async () => {
    const { service } = build();
    expect(((await service.create(create)) as unknown as { sequence: number }).sequence).toBe(1);
  });

  it('starts as a draft that is served to nobody', async () => {
    const { service, db } = build();
    await service.create(create);
    // Nothing sets a status here, so the column default (DRAFT) stands.
    expect(db.otaRelease.create.mock.calls[0][0].data.status).toBeUndefined();
  });

  it('stamps the moment a rollback points at', async () => {
    const { service, db } = build();
    await service.create({ ...create, kind: 'ROLLBACK' as never });
    expect(db.otaRelease.create.mock.calls[0][0].data.commitTime).toBeInstanceOf(Date);
  });
});

describe('adding the bundle', () => {
  const file = { buffer: Buffer.from('x'), originalname: 'index.bundle', mimetype: '', size: 1 };

  it('refuses to change what a published release contains', async () => {
    const { service } = build(draft({ status: 'PUBLISHED' }));
    // Devices already running it think they have what it said.
    await expect(service.addAsset('r1', file as never, true)).rejects.toThrow(/already published/);
  });

  it('refuses a second bundle', async () => {
    const { service } = build(draft());
    await expect(service.addAsset('r1', file as never, true)).rejects.toThrow(/already has a bundle/);
  });

  it('takes an ordinary asset beside the bundle', async () => {
    const { service, ota } = build(draft());
    await service.addAsset('r1', { ...file, originalname: 'logo.png' } as never, false);
    expect(ota.addAsset.mock.calls[0][1]).toMatchObject({ isLaunchAsset: false });
  });

  it('says so when the release is not there', async () => {
    const { service } = build(null);
    await expect(service.addAsset('nope', file as never, true)).rejects.toThrow(/No such release/);
  });
});

describe('publishing', () => {
  it('refuses a release with no bundle', async () => {
    const { service } = build(draft({ assets: [] }));
    // It would answer every device with a manifest pointing at nothing.
    await expect(
      service.update('r1', { status: 'PUBLISHED' as never }, 'p1'),
    ).rejects.toThrow(/no bundle/);
  });

  it('allows a rollback, which has nothing to download', async () => {
    const { service } = build(draft({ kind: 'ROLLBACK', assets: [] }));
    await expect(
      service.update('r1', { status: 'PUBLISHED' as never }, 'p1'),
    ).resolves.toBeDefined();
  });

  it('records who put it live, and when', async () => {
    const { service, db } = build(draft());
    await service.update('r1', { status: 'PUBLISHED' as never }, 'p1');

    const data = db.otaRelease.update.mock.calls[0][0].data;
    expect(data.publishedBy).toBe('p1');
    expect(data.activatedAt).toBeInstanceOf(Date);
  });

  it('keeps the first activation date when it is republished', async () => {
    const first = new Date('2026-09-01T00:00:00.000Z');
    const { service, db } = build(draft({ status: 'ARCHIVED', activatedAt: first }));
    await service.update('r1', { status: 'PUBLISHED' as never }, 'p2');
    expect(db.otaRelease.update.mock.calls[0][0].data.activatedAt).toBe(first);
  });

  it('retires whatever was live in the same slot', async () => {
    const { service, db } = build(draft());
    await service.update('r1', { status: 'PUBLISHED' as never }, 'p1');

    // The manifest serves the newest published release, so a second would sit
    // there looking live while nobody ran it.
    expect(db.otaRelease.updateMany.mock.calls[0][0]).toMatchObject({
      where: {
        channel: 'production',
        platform: 'ios',
        runtimeVersion: '1.0.0',
        status: 'PUBLISHED',
        id: { not: 'r1' },
      },
      data: { status: 'ARCHIVED' },
    });
  });

  /*
   * Publishing something older than what is live is the one publish that
   * silently does nothing. expo-updates will not load an update older than
   * the one running, so every phone stays where it is — while the records
   * show the newer release retired. The screen and the fleet then disagree,
   * and nothing says so.
   */
  describe('when something newer is already live', () => {
    const older = new Date('2026-09-01T00:00:00.000Z');
    const newer = new Date('2026-09-10T00:00:00.000Z');

    function withLive(liveAt: Date, mine: Date) {
      const built = build(draft({ createdAt: mine }));
      built.db.otaRelease.findFirst = jest.fn(async () => ({
        sequence: 9,
        createdAt: liveAt,
      }));
      return built;
    }

    it('refuses, rather than retiring a release every phone is still running', async () => {
      const { service, db } = withLive(newer, older);
      await expect(
        service.update('r1', { status: 'PUBLISHED' as never }, 'p1'),
      ).rejects.toThrow(/will not go backwards/);
      expect(db.otaRelease.updateMany).not.toHaveBeenCalled();
      expect(db.otaRelease.update).not.toHaveBeenCalled();
    });

    it('names the release in the way, and what to do instead', async () => {
      const { service } = withLive(newer, older);
      const error: Error = await service
        .update('r1', { status: 'PUBLISHED' as never }, 'p1')
        .then(() => new Error('it published'))
        .catch((e: Error) => e);
      expect(error.message).toMatch(/OTA 9/);
      expect(error.message).toMatch(/Roll back/);
    });

    it('still publishes one that is newer than what is live', async () => {
      const { service } = withLive(older, newer);
      await expect(
        service.update('r1', { status: 'PUBLISHED' as never }, 'p1'),
      ).resolves.toBeDefined();
    });

    it('does not stand in the way of a live release moving its own rollout', async () => {
      // The live release is excluded by id, so nothing is found to compare
      // against — pausing or advancing the current one is never a downgrade.
      const { service, db } = build(draft({ status: 'PUBLISHED', createdAt: older }));
      await service.update('r1', { rolloutPercent: 0 }, 'p1');
      expect(db.otaRelease.findFirst).not.toHaveBeenCalled();
      expect(db.otaRelease.update).toHaveBeenCalled();
    });

    it('looks only within the same channel, platform and runtime', async () => {
      const { service, db } = withLive(older, newer);
      await service.update('r1', { status: 'PUBLISHED' as never }, 'p1');
      expect(db.otaRelease.findFirst.mock.calls[0][0].where).toMatchObject({
        channel: 'production',
        platform: 'ios',
        runtimeVersion: '1.0.0',
        status: 'PUBLISHED',
        id: { not: 'r1' },
      });
    });
  });

  it('retires nothing when only the rollout moved', async () => {
    const { service, db } = build(draft({ status: 'PUBLISHED' }));
    await service.update('r1', { rolloutPercent: 50 }, 'p1');
    expect(db.otaRelease.updateMany).not.toHaveBeenCalled();
  });

  it('moves the rollout without touching anything else', async () => {
    const { service, db } = build(draft({ status: 'PUBLISHED' }));
    await service.update('r1', { rolloutPercent: 50 }, 'p1');

    const data = db.otaRelease.update.mock.calls[0][0].data;
    expect(data.rolloutPercent).toBe(50);
    expect(data.publishedBy).toBeUndefined();
  });
});

describe('going back to what was running before', () => {
  const release = (over: Record<string, unknown> = {}) => ({
    id: 'r2',
    channel: 'production',
    platform: 'ios',
    runtimeVersion: '1',
    kind: 'UPDATE',
    status: 'PUBLISHED',
    activatedAt: null,
    ...over,
  });

  it('retires the release being rolled back', async () => {
    const { service, db } = build();
    db.otaRelease.findUnique = jest.fn(async () => release());
    db.otaRelease.findFirst = jest.fn(async () => null);

    await service.rollback('r2');

    expect(db.otaRelease.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'r2' },
      data: { status: 'ARCHIVED' },
    });
  });

  it('re-publishes the update it replaced, at everybody', async () => {
    const { service, db } = build();
    db.otaRelease.findUnique = jest.fn(async () => release());
    db.otaRelease.findFirst = jest.fn(async () => release({ id: 'r1', status: 'ARCHIVED' }));

    await service.rollback('r2', 'platform-user-1');

    const restore = db.otaRelease.update.mock.calls[1][0];
    expect(restore.where).toEqual({ id: 'r1' });
    expect(restore.data).toMatchObject({ status: 'PUBLISHED', rolloutPercent: 100 });
    expect(restore.data.publishedBy).toBe('platform-user-1');
  });

  /*
   * Full rollout, not a canary. A rollback is not an experiment, it is an
   * admission: everybody should be off the bad bundle at once rather than a
   * fifth of them at a time.
   */
  it('never rolls back to a partial rollout', async () => {
    const { service, db } = build();
    db.otaRelease.findUnique = jest.fn(async () => release());
    db.otaRelease.findFirst = jest.fn(async () => release({ id: 'r1', status: 'ARCHIVED' }));

    await service.rollback('r2');

    expect(db.otaRelease.update.mock.calls[1][0].data.rolloutPercent).toBe(100);
  });

  it('looks only within the same channel, platform and runtime', async () => {
    const { service, db } = build();
    db.otaRelease.findUnique = jest.fn(async () => release());
    db.otaRelease.findFirst = jest.fn(async () => null);

    await service.rollback('r2');

    expect(db.otaRelease.findFirst.mock.calls[0][0].where).toMatchObject({
      channel: 'production',
      platform: 'ios',
      runtimeVersion: '1',
    });
  });

  /*
   * Rolling back to a rollback would walk backwards through history one press
   * at a time, and says nothing about which bundle anyone ends up running.
   */
  it('goes back to an ordinary update, never to another rollback', async () => {
    const { service, db } = build();
    db.otaRelease.findUnique = jest.fn(async () => release());
    db.otaRelease.findFirst = jest.fn(async () => null);

    await service.rollback('r2');

    expect(db.otaRelease.findFirst.mock.calls[0][0].where.kind).toBe('UPDATE');
    expect(db.otaRelease.findFirst.mock.calls[0][0].where.id).toEqual({ not: 'r2' });
  });

  it('takes the newest one it retired, not the oldest', async () => {
    const { service, db } = build();
    db.otaRelease.findUnique = jest.fn(async () => release());
    db.otaRelease.findFirst = jest.fn(async () => null);

    await service.rollback('r2');

    expect(db.otaRelease.findFirst.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
  });

  /*
   * With nothing to go back to, the app falls back to the bundle inside the
   * binary — the last thing known to have worked. Saying so lets the screen
   * tell somebody that rather than implying a release was restored.
   */
  it('says plainly when there was nothing to go back to', async () => {
    const { service, db } = build();
    db.otaRelease.findUnique = jest.fn(async () => release());
    db.otaRelease.findFirst = jest.fn(async () => null);

    await expect(service.rollback('r2')).resolves.toEqual({ rolledBackTo: null });
    expect(db.otaRelease.update).toHaveBeenCalledTimes(1);
  });

  it('refuses a release that does not exist', async () => {
    const { service, db } = build();
    db.otaRelease.findUnique = jest.fn(async () => null);

    await expect(service.rollback('nope')).rejects.toThrow('No such release');
  });
});

describe('the version gate', () => {
  const dto = (over: Record<string, unknown> = {}) =>
    ({
      platform: 'ios' as never,
      channel: 'production',
      latestBuild: 200,
      storeUrl: 'https://apps.apple.com/app/id1',
      ...over,
    }) as never;

  it('is one row per platform and channel', async () => {
    const { service, db } = build();
    await service.setGate(dto());

    expect(db.appVersionGate.upsert.mock.calls[0][0].where).toEqual({
      platform_channel: { platform: 'ios', channel: 'production' },
    });
  });

  it('clears what was left out rather than keeping a stale message', async () => {
    const { service, db } = build();
    await service.setGate(dto());

    expect(db.appVersionGate.upsert.mock.calls[0][0].update).toMatchObject({
      latestVersionName: null,
      message: null,
    });
  });

  /*
   * CI records a build; it cannot know whether review has finished. Leaving
   * latestIsLive out has to mean "do not touch it", or every release would
   * quietly un-publish the store state a person had confirmed.
   */
  it('leaves the store state alone when the caller did not mention it', async () => {
    const { service, db } = build();
    await service.setGate(dto());

    expect(db.appVersionGate.upsert.mock.calls[0][0].update).not.toHaveProperty('latestIsLive');
    expect(db.appVersionGate.upsert.mock.calls[0][0].update).not.toHaveProperty('liveConfirmedAt');
  });

  /* Same reasoning, and more consequential: a deploy must not lower a floor. */
  it('leaves the supported floor alone when the caller did not mention it', async () => {
    const { service, db } = build();
    await service.setGate(dto());

    expect(db.appVersionGate.upsert.mock.calls[0][0].update).not.toHaveProperty(
      'minSupportedBuild',
    );
  });

  it('stamps when the store went live, so the date answers "since when"', async () => {
    const { service, db } = build();
    await service.setGate(dto({ latestIsLive: true }));

    const update = db.appVersionGate.upsert.mock.calls[0][0].update;
    expect(update.latestIsLive).toBe(true);
    expect(update.liveConfirmedAt).toBeInstanceOf(Date);
  });

  it('clears that date again when somebody says it is not live after all', async () => {
    const { service, db } = build();
    await service.setGate(dto({ latestIsLive: false }));

    const update = db.appVersionGate.upsert.mock.calls[0][0].update;
    expect(update.latestIsLive).toBe(false);
    expect(update.liveConfirmedAt).toBeNull();
  });

  it('records who changed it', async () => {
    const { service, db } = build();
    await service.setGate(dto(), 'platform-user-1');

    expect(db.appVersionGate.upsert.mock.calls[0][0].update.updatedBy).toBe('platform-user-1');
  });

  it('starts a new row not live, whatever else it was given', async () => {
    const { service, db } = build();
    await service.setGate(dto());

    expect(db.appVersionGate.upsert.mock.calls[0][0].create.latestIsLive).toBe(false);
    expect(db.appVersionGate.upsert.mock.calls[0][0].create.minSupportedBuild).toBe(0);
  });
});

/*
 * The list used to end at a hard `take: 100` and return a bare array. A
 * channel that publishes daily reaches a hundred inside four months, and from
 * then on the older releases simply did not exist to the screen — no total, no
 * "and more", nothing to say the history had been cut off. A page with a count
 * on it is the difference between "that is all of them" and "that is all we
 * showed you".
 */
describe('listing releases', () => {
  const query = (over: Record<string, unknown> = {}) =>
    ({ page: 1, limit: 25, skip: 0, ...over }) as never;

  function listing(rows: unknown[], total: number) {
    const built = build();
    (built.db as unknown as Record<string, jest.Mock>).$transaction = jest.fn(async () => [
      rows,
      total,
    ]);
    return built;
  }

  it('asks for one page rather than a flat hundred', async () => {
    const { service, db } = listing([], 0);
    await service.list(query({ page: 3, limit: 25, skip: 50 }));

    expect(db.otaRelease.findMany.mock.calls[0][0]).toMatchObject({ skip: 50, take: 25 });
  });

  it('says how many there are, not just how many came back', async () => {
    const { service } = listing([{ id: 'r1' }], 214);
    const result = (await service.list(query())) as { meta: { total: number; pages: number } };

    expect(result.meta.total).toBe(214);
    expect(result.meta.pages).toBe(9);
  });

  it('counts against the same filter it lists with', async () => {
    const { service, db } = listing([], 0);
    await service.list(query({ channel: 'production', platform: 'ios' }));

    expect(db.otaRelease.count.mock.calls[0][0].where).toEqual(
      db.otaRelease.findMany.mock.calls[0][0].where,
    );
  });

  it('filters by channel and platform when asked', async () => {
    const { service, db } = listing([], 0);
    await service.list(query({ channel: 'production', platform: 'ios' }));

    expect(db.otaRelease.findMany.mock.calls[0][0].where).toEqual({
      channel: 'production',
      platform: 'ios',
    });
  });

  it('ignores a platform that is neither of the two', async () => {
    const { service, db } = listing([], 0);
    await service.list(query({ platform: 'windows' }));

    expect(db.otaRelease.findMany.mock.calls[0][0].where).toEqual({});
  });

  /*
   * Newest first is not only a preference here. The screens decide whether
   * publishing a draft would retire something NEWER by looking at the releases
   * they have loaded — which is only sound while anything newer sorts above,
   * and so is always already loaded. Reverse this and both screens quietly
   * stop warning about a downgrade.
   */
  it('returns them newest first, which is what makes the supersede warning sound', async () => {
    const { service, db } = listing([], 0);
    await service.list(query());

    expect(db.otaRelease.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
  });
});

/*
 * The incident this exists for: two native builds dispatched 49 seconds apart
 * serialised behind one another, and the second built the tree from before the
 * first one's version bump. It uploaded build 29828651 calling itself 1.0.0,
 * twenty-three minutes after build 29828633 called itself 1.0.1, and wrote
 * that over the gate. Nothing failed. It was found days later by somebody
 * trying to mark a build live and noticing the number was not the one they
 * meant — by which time the update screen would have been telling people on
 * 1.0.1 to go and install 1.0.0.
 */
describe('recording what the stores are serving', () => {
  const gate = (over: Record<string, unknown> = {}) =>
    ({
      platform: 'ios',
      channel: 'development',
      latestBuild: 29828651,
      latestVersionName: '1.0.0',
      storeUrl: 'https://apps.apple.com/app/id1',
      ...over,
    }) as never;

  function existing(latestBuild: number, latestVersionName: string | null) {
    const built = build();
    built.db.appVersionGate.findUnique = jest.fn(async () => ({
      latestBuild,
      latestVersionName,
    }));
    return built;
  }

  it('refuses a newer build that calls itself an older version', async () => {
    const { service, db } = existing(29828633, '1.0.1');
    await expect(service.setGate(gate())).rejects.toThrow(/cannot carry an older version name/);
    expect(db.appVersionGate.upsert).not.toHaveBeenCalled();
  });

  it('names both builds, so the one to keep is obvious', async () => {
    const { service } = existing(29828633, '1.0.1');
    const error: Error = await service
      .setGate(gate())
      .then(() => new Error('it recorded'))
      .catch((e: Error) => e);

    expect(error.message).toMatch(/29828651/);
    expect(error.message).toMatch(/29828633/);
  });

  it('records a newer build with a newer version, which is the normal case', async () => {
    const { service, db } = existing(29828633, '1.0.1');
    await service.setGate(gate({ latestBuild: 29828700, latestVersionName: '1.0.2' }));
    expect(db.appVersionGate.upsert).toHaveBeenCalled();
  });

  it('records a newer build with the same version — a rebuild is not a downgrade', async () => {
    const { service, db } = existing(29828633, '1.0.1');
    await service.setGate(gate({ latestBuild: 29828700, latestVersionName: '1.0.1' }));
    expect(db.appVersionGate.upsert).toHaveBeenCalled();
  });

  it('lets a person put the number back by hand, which is how this gets fixed', async () => {
    // Correcting it means writing a LOWER build number, which is never the
    // shape being refused.
    const { service, db } = existing(29828651, '1.0.0');
    await service.setGate(gate({ latestBuild: 29828633, latestVersionName: '1.0.1' }));
    expect(db.appVersionGate.upsert).toHaveBeenCalled();
  });

  it('records the first gate for a platform, with nothing to compare against', async () => {
    const { service, db } = build();
    db.appVersionGate.findUnique = jest.fn(async () => null);
    await service.setGate(gate());
    expect(db.appVersionGate.upsert).toHaveBeenCalled();
  });

  it('does not block on a version name it cannot read', async () => {
    // "1.0.0-rc2" is not a run of numbers, and refusing a real record over a
    // string this does not understand is worse than letting it through.
    const { service, db } = existing(29828633, '1.0.1');
    await service.setGate(gate({ latestBuild: 29828700, latestVersionName: '1.0.0-rc2' }));
    expect(db.appVersionGate.upsert).toHaveBeenCalled();
  });
});

describe('olderVersion', () => {
  it('compares the parts as numbers, not as text', () => {
    // "1.10.0" sorts before "1.9.0" as a string, and is newer as a version.
    expect(olderVersion('1.9.0', '1.10.0')).toBe(true);
    expect(olderVersion('1.10.0', '1.9.0')).toBe(false);
  });

  it('treats a missing part as zero', () => {
    expect(olderVersion('1.0', '1.0.1')).toBe(true);
    expect(olderVersion('1.0.0', '1.0')).toBe(false);
  });

  it('says no for the same version', () => {
    expect(olderVersion('1.0.1', '1.0.1')).toBe(false);
  });

  it('says no rather than guessing at anything it cannot read', () => {
    for (const odd of [undefined, null, '', '   ', 'v1.0.1', '1.0.0-rc2', 'latest']) {
      expect(olderVersion(odd, '2.0.0')).toBe(false);
      expect(olderVersion('1.0.0', odd)).toBe(false);
    }
  });
});

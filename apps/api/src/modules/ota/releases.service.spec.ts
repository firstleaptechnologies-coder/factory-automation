import { ReleasesService } from './releases.service';
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

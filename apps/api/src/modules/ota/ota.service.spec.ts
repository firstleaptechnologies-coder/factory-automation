import { OtaService } from './ota.service';
import { prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

const RELEASE = {
  id: 'e1e1e1e1-0000-4000-8000-000000000001',
  channel: 'production',
  runtimeVersion: '1.0.0',
  platform: 'ios',
  kind: 'UPDATE',
  status: 'PUBLISHED',
  rolloutPercent: 100,
  sequence: 3,
  metadata: {},
  extra: {},
  commitTime: null,
  createdAt: new Date('2026-09-08T10:00:00.000Z'),
  assets: [
    {
      id: 'a1',
      isLaunchAsset: true,
      key: 'bundlekey',
      hash: 'bundlehash',
      contentType: 'application/javascript',
      fileExtension: '.bundle',
    },
    {
      id: 'a2',
      isLaunchAsset: false,
      key: 'imagekey',
      hash: 'imagehash',
      contentType: 'image/png',
      fileExtension: '.png',
    },
  ],
};

function build(release: unknown = RELEASE, storage: Record<string, jest.Mock> = {}) {
  const db = prismaMock() as never as Db;
  db.otaRelease.findFirst = jest.fn(async () => release);
  const store = {
    put: jest.fn(async (..._args: unknown[]) => ({
      backend: 'DATABASE',
      byteSize: 4,
      checksum: 'c',
      isEncrypted: true,
    })),
    read: jest.fn(async () => Buffer.from('bytes')),
    ...storage,
  };
  return { service: new OtaService(db as never, store as never), db, store };
}

const ask = (over: Record<string, unknown> = {}) => ({
  platform: 'ios',
  runtimeVersion: '1.0.0',
  channel: 'production',
  extraParams: 'rollout-bucket="10"',
  currentUpdateId: null,
  baseUrl: 'https://api.test',
  ...over,
});

/** The manifest or directive inside the multipart body. */
const partOf = (body: string): Record<string, unknown> =>
  JSON.parse(/\r\n\r\n(\{[\s\S]*?\})\r\n--/.exec(body)![1]);

describe('what the app is told to run', () => {
  it('hands over the bundle and its assets', async () => {
    const { service } = build();
    const response = await service.manifest(ask());
    const manifest = partOf(response.body) as Record<string, never>;

    expect(manifest.id).toBe(RELEASE.id);
    expect((manifest.launchAsset as Record<string, string>).key).toBe('bundlekey');
    expect(manifest.assets).toHaveLength(1);
  });

  it('points the assets at this API, so a release needs no second host', async () => {
    const { service } = build();
    const manifest = partOf((await service.manifest(ask())).body) as Record<string, never>;
    expect((manifest.launchAsset as Record<string, string>).url).toBe(
      'https://api.test/api/updates/assets/a1',
    );
  });

  it('says nothing is newer when the client did not identify itself', async () => {
    const { service, db } = build();
    const response = await service.manifest(ask({ runtimeVersion: undefined }));

    expect(partOf(response.body)).toEqual({ type: 'noUpdateAvailable' });
    // Not even asked for: a client that cannot say what it is cannot be given
    // code to run.
    expect(db.otaRelease.findFirst).not.toHaveBeenCalled();
  });

  it('asks only for a published release on the right runtime', async () => {
    const { service, db } = build();
    await service.manifest(ask());

    // A bundle built against different native code than the binary has is how
    // an app crashes on launch with no way back except the store.
    expect(db.otaRelease.findFirst.mock.calls[0][0].where).toMatchObject({
      channel: 'production',
      platform: 'ios',
      runtimeVersion: '1.0.0',
      status: 'PUBLISHED',
    });
  });

  it('says nothing is newer when there is nothing published', async () => {
    const { service } = build(null);
    expect(partOf((await service.manifest(ask())).body)).toEqual({ type: 'noUpdateAvailable' });
  });

  it('leaves an install outside the rollout where it was', async () => {
    const { service } = build({ ...RELEASE, rolloutPercent: 5 });
    // From the device's point of view "not yours yet" and "nothing new" are the
    // same thing, and one of them is not an error.
    expect(partOf((await service.manifest(ask())).body)).toEqual({ type: 'noUpdateAvailable' });
  });

  it('serves an install inside the rollout', async () => {
    const { service } = build({ ...RELEASE, rolloutPercent: 20 });
    expect(partOf((await service.manifest(ask())).body).id).toBe(RELEASE.id);
  });

  it('does not send the same bundle to a device already running it', async () => {
    const { service } = build();
    const response = await service.manifest(ask({ currentUpdateId: RELEASE.id }));
    expect(partOf(response.body)).toEqual({ type: 'noUpdateAvailable' });
  });

  it('sends a rollback back to the binary’s own bundle', async () => {
    const { service } = build({
      ...RELEASE,
      kind: 'ROLLBACK',
      commitTime: new Date('2026-09-01T00:00:00.000Z'),
      assets: [],
    });

    expect(partOf((await service.manifest(ask())).body)).toEqual({
      type: 'rollBackToEmbedded',
      parameters: { commitTime: '2026-09-01T00:00:00.000Z' },
    });
  });

  it('refuses to serve a release with no bundle', async () => {
    const { service } = build({ ...RELEASE, assets: [] });
    // A manifest pointing at nothing is worse than no manifest.
    expect(partOf((await service.manifest(ask())).body)).toEqual({ type: 'noUpdateAvailable' });
  });
});

describe('an asset', () => {
  it('comes back from whichever backend holds it', async () => {
    const { service, db, store } = build();
    db.otaReleaseAsset.findUnique = jest.fn(async () => ({
      id: 'a1',
      backend: 'DATABASE',
      bucket: null,
      objectKey: null,
      data: Buffer.from('x'),
      isEncrypted: true,
      contentType: 'application/javascript',
    }));

    const asset = await service.asset('a1');
    expect(asset.contentType).toBe('application/javascript');
    expect(store.read).toHaveBeenCalled();
  });

  it('says so when it is not there', async () => {
    const { service, db } = build();
    db.otaReleaseAsset.findUnique = jest.fn(async () => null);
    await expect(service.asset('nope')).rejects.toThrow(/No such asset/);
  });
});

describe('the version gate', () => {
  it('says a binary is fine when nothing has been set', async () => {
    const { service, db } = build();
    db.appVersionGate.findUnique = jest.fn(async () => null);
    expect(await service.versionCheck('ios')).toEqual({ supported: true });
  });

  it('passes on the floor and the words to show', async () => {
    const { service, db } = build();
    db.appVersionGate.findUnique = jest.fn(async () => ({
      minimumVersion: '1.2.0',
      recommendedVersion: '1.4.0',
      message: 'Punching changed — please update.',
    }));

    expect(await service.versionCheck('android', 'production')).toMatchObject({
      minimumVersion: '1.2.0',
      recommendedVersion: '1.4.0',
    });
  });
});

describe('storing an asset', () => {
  it('records both hashes the client needs', async () => {
    const { service, db } = build();
    await service.addAsset('r1', {
      bytes: Buffer.from('the bundle'),
      fileName: 'index.bundle',
      contentType: 'application/javascript',
      isLaunchAsset: true,
    });

    const data = db.otaReleaseAsset.create.mock.calls[0][0].data;
    expect(data.key).toMatch(/^[0-9a-f]{32}$/);
    expect(data.hash).not.toMatch(/[+/=]/);
    expect(data).toMatchObject({ isLaunchAsset: true, fileExtension: '.bundle' });
  });

  it('asks for S3, which falls back to the database where there is none', async () => {
    const { service, store } = build();
    await service.addAsset('r1', {
      bytes: Buffer.from('x'),
      fileName: 'a.png',
      contentType: 'image/png',
    });
    // Bundles are megabytes; the database is the fallback, not the intent.
    expect(store.put.mock.calls[0][1]).toMatchObject({ backend: 'S3', keyPrefix: 'ota/r1' });
  });
});

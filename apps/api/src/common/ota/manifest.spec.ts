import {
  buildManifest,
  buildMultipartResponse,
  deterministicBucket,
  isInRollout,
  noUpdateAvailableDirective,
  parseRolloutBucket,
  rollBackToEmbeddedDirective,
} from './manifest';

const asset = (key: string) => ({
  key,
  hash: 'hash',
  url: 'https://api.test/api/updates/assets/a1',
  contentType: 'application/javascript',
  fileExtension: '.bundle',
});

describe('the manifest', () => {
  const built = buildManifest({
    id: 'abc',
    createdAt: new Date('2026-09-08T10:00:00.000Z'),
    runtimeVersion: '1.0.0',
    sequence: 7,
    metadata: {},
    extra: { expoClient: {} },
    launchAsset: asset('bundle'),
    assets: [asset('image')],
  });

  it('names the bundle and everything it needs', () => {
    expect(built.launchAsset.key).toBe('bundle');
    expect(built.assets).toHaveLength(1);
  });

  it('carries the build number the app shows', () => {
    // So somebody on the floor can say "OTA 7" instead of reading a UUID.
    expect(built.extra).toMatchObject({ otaBuildNumber: 7, expoClient: {} });
  });
});

describe('the multipart body', () => {
  it('names each part so the client can find it', () => {
    const response = buildMultipartResponse([
      { name: 'manifest', body: '{"id":"abc"}', sign: true },
    ]);

    expect(response.headers['content-type']).toMatch(/^multipart\/mixed; boundary=expo-[0-9a-f]+$/);
    expect(response.body).toContain('Content-Disposition: form-data; name="manifest"');
    expect(response.body).toContain('{"id":"abc"}');
  });

  it('closes the boundary it opened', () => {
    const response = buildMultipartResponse([{ name: 'directive', body: '{}', sign: false }]);
    const boundary = /boundary=(expo-[0-9a-f]+)/.exec(response.headers['content-type'])![1];
    expect(response.body.startsWith(`--${boundary}\r\n`)).toBe(true);
    expect(response.body.endsWith(`--${boundary}--\r\n`)).toBe(true);
  });

  it('says which protocol it is speaking', () => {
    const response = buildMultipartResponse([{ name: 'directive', body: '{}', sign: false }]);
    expect(response.headers['expo-protocol-version']).toBe('1');
  });

  it('goes unsigned when no key is configured', () => {
    const response = buildMultipartResponse([{ name: 'manifest', body: '{}', sign: true }]);
    expect(response.body).not.toContain('expo-signature');
  });
});

describe('directives', () => {
  it('says there is nothing newer', () => {
    expect(JSON.parse(noUpdateAvailableDirective())).toEqual({ type: 'noUpdateAvailable' });
  });

  it('sends a device back to the bundle its binary shipped with', () => {
    // The way out when an update turns out worse than what it replaced.
    expect(JSON.parse(rollBackToEmbeddedDirective('2026-09-08T10:00:00.000Z'))).toEqual({
      type: 'rollBackToEmbedded',
      parameters: { commitTime: '2026-09-08T10:00:00.000Z' },
    });
  });
});

describe('a staged rollout', () => {
  it('includes nobody at nought and everybody at a hundred', () => {
    expect(isInRollout(0, 0)).toBe(false);
    expect(isInRollout(99, 100)).toBe(true);
  });

  it('only ever adds people as it is walked up', () => {
    const included = (percent: number) =>
      Array.from({ length: 100 }, (_, bucket) => bucket).filter((bucket) =>
        isInRollout(bucket, percent),
      );
    // Raising a rollout must never take it away from somebody who had it.
    expect(included(20).every((bucket) => included(50).includes(bucket))).toBe(true);
  });

  it('reads the install’s own bucket back off the request', () => {
    expect(parseRolloutBucket('rollout-bucket="42"')).toBe(42);
    expect(parseRolloutBucket('rollout-bucket=7')).toBe(7);
  });

  it('ignores nonsense rather than guessing', () => {
    expect(parseRolloutBucket(null)).toBeNull();
    expect(parseRolloutBucket('something-else="1"')).toBeNull();
  });

  it('keeps a bucket inside the range whatever it was sent', () => {
    expect(parseRolloutBucket('rollout-bucket="999"')).toBe(99);
  });

  it('gives an install with no bucket a stable one', () => {
    // Otherwise a device would be inside a rollout on one launch and outside
    // it on the next, updating and un-updating itself.
    expect(deterministicBucket('install-a')).toBe(deterministicBucket('install-a'));
    expect(deterministicBucket('install-a')).toBeGreaterThanOrEqual(0);
    expect(deterministicBucket('install-a')).toBeLessThan(100);
  });
});

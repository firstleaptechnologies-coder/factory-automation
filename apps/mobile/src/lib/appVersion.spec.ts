/**
 * Loading the helper fresh each time, with the native modules set first.
 *
 * `import * as Application` is compiled to a namespace that COPIES the CommonJS
 * exports, so mutating the mock after the fact changes nothing the helper can
 * see. Resetting the registry and setting the values on the fresh copy — the
 * same approach client.spec.ts takes — is what actually reaches it.
 */
function load(
  native: { build?: string | null; version?: string | null } = {},
  update: { manifest?: unknown; runtime?: string | null } = {},
) {
  jest.resetModules();

  /* eslint-disable @typescript-eslint/no-require-imports */
  const application = require('expo-application') as Record<string, unknown>;
  application.nativeBuildVersion = 'build' in native ? native.build : null;
  application.nativeApplicationVersion = 'version' in native ? native.version : null;

  const updates = require('expo-updates') as Record<string, unknown>;
  if ('manifest' in update) updates.manifest = update.manifest;
  if ('runtime' in update) updates.runtimeVersion = update.runtime;

  return require('./appVersion') as typeof import('./appVersion');
  /* eslint-enable @typescript-eslint/no-require-imports */
}

describe('the numbers a build reports', () => {
  it('reads the build number out of the binary', () => {
    expect(load({ build: '29827684' }).nativeBuildNumber()).toBe(29827684);
  });

  it('reads the marketing version out of the binary', () => {
    expect(load({ version: '1.2.0' }).marketingVersion()).toBe('1.2.0');
  });

  /*
   * A Metro build has no binary around it, so both come back null. Printing
   * "undefined" or "NaN" on a settings screen is the kind of thing a shop
   * reads out down the phone, and it tells nobody anything.
   */
  it('says something sensible when there is no binary to read', () => {
    const v = load({ build: null, version: null });
    expect(v.nativeBuildNumber()).toBe(0);
    expect(v.marketingVersion()).toBe('?');
    expect(v.versionLabel()).not.toMatch(/undefined|NaN|null/);
  });
});

describe('which bundle is running', () => {
  it('reads the sequence the manifest carries', () => {
    expect(load({}, { manifest: { extra: { otaBuildNumber: 7 } } }).otaBuildNumber()).toBe(7);
  });

  it('is zero for the bundle that shipped inside the binary', () => {
    expect(load({}, { manifest: null }).otaBuildNumber()).toBe(0);
  });

  it('is zero rather than a guess when the manifest says something odd', () => {
    expect(load({}, { manifest: { extra: { otaBuildNumber: 'seven' } } }).otaBuildNumber()).toBe(0);
  });

  it('survives a manifest that throws when read', () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const updates = require('expo-updates') as Record<string, unknown>;
    Object.defineProperty(updates, 'manifest', {
      get() { throw new Error('no manifest in this runtime'); },
      configurable: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect((require('./appVersion') as typeof import('./appVersion')).otaBuildNumber()).toBe(0);
  });

  it('names the runtime, since a bundle for another one cannot run', () => {
    expect(load({}, { runtime: '2' }).runtimeVersion()).toBe('2');
  });

  it('says so plainly when even that is missing', () => {
    expect(load({}, { runtime: null }).runtimeVersion()).toBe('unknown');
  });
});

describe('the line somebody reads down a phone', () => {
  it('carries all four numbers', () => {
    const label = load(
      { version: '1.2.0', build: '29827684' },
      { manifest: { extra: { otaBuildNumber: 3 } } },
    ).versionLabel();
    expect(label).toContain('1.2.0');
    expect(label).toContain('build 29827684');
    expect(label).toContain('OTA 3');
    // The channel is what says which world this build belongs to.
    expect(label).toMatch(/local|development|production/);
  });

  it('does not say "OTA 0", which reads like a version', () => {
    const v = load({}, { manifest: null });
    expect(v.versionLabel()).toContain('no update taken');
    expect(v.versionLabel()).not.toContain('OTA 0');
  });
});

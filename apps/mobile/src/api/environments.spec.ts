import {readFileSync} from 'fs';
import {join} from 'path';
import {ENVIRONMENTS, originFor} from './environments';

/**
 * The two native files decide what a binary is: which channel it carries, and
 * therefore which server it talks to and where it asks for updates. Neither
 * can be changed by an update, so a mistake in them ships to a shop and stays
 * there until the store lets a new build through.
 *
 * These read the files rather than describing them.
 */
const root = join(__dirname, '..', '..');
const plist = readFileSync(join(root, 'ios', 'Expo.plist'), 'utf8');
const strings = readFileSync(
  join(root, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml'),
  'utf8',
);

const iosChannel = /<key>expo-channel-name<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1];
const androidChannel = /"expo-channel-name"\s*:\s*"([^"]+)"/.exec(strings)?.[1];

const iosUpdateUrl = /<key>EXUpdatesURL<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1];
const androidUpdateUrl = /EXPO_UPDATE_URL"\s+android:value="([^"]+)"/.exec(
  readFileSync(join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8'),
)?.[1];

describe('the channel a binary carries', () => {
  it('is written in both native files', () => {
    expect(iosChannel).toBeTruthy();
    expect(androidChannel).toBeTruthy();
  });

  it('is the same channel on both platforms', () => {
    // Two platforms on different channels is one shop on two servers.
    expect(androidChannel).toBe(iosChannel);
  });

  it('is a channel this app knows a server for', () => {
    expect(Object.keys(ENVIRONMENTS)).toContain(iosChannel!);
  });

  it('has a server on both platforms, so the build can reach one', () => {
    // Null here means a deployment that does not exist yet. Nothing falls back
    // to localhost — a release pointed at a developer's desk is worse than a
    // build that refuses to be made.
    expect(originFor(iosChannel!, 'ios')).not.toBeNull();
    expect(originFor(androidChannel!, 'android')).not.toBeNull();
  });
});

describe('where a binary asks for updates', () => {
  it('is the same server it sends its work to, on iOS', () => {
    expect(iosUpdateUrl).toBe(`${originFor(iosChannel!, 'ios')}/api/updates/manifest`);
  });

  it('is the same server it sends its work to, on Android', () => {
    expect(androidUpdateUrl).toBe(
      `${originFor(androidChannel!, 'android')}/api/updates/manifest`,
    );
  });
});

/**
 * The deployments are described twice — here, for the app at runtime, and in
 * deploy/environments.json, which is what actually provisions them. Two lists
 * of the same hosts drift, and the way this one drifts is silent: the app keeps
 * calling yesterday's address and every screen fails with a network error that
 * names nothing.
 *
 * It has already happened once. configure-ota-target.js repointed the native
 * files at staging while this table still said localhost, and only the update
 * URL check below caught it.
 */
describe('against deploy/environments.json', () => {
  const infra = JSON.parse(
    readFileSync(join(root, '..', '..', 'deploy', 'environments.json'), 'utf8'),
  ) as Record<string, { otaChannel?: string; apiDomain?: string }>;

  const deployed = Object.entries(infra).filter(([key]) => !key.startsWith('_'));

  it('describes some environments, so this is testing something', () => {
    expect(deployed.length).toBeGreaterThan(0);
  });

  it.each(deployed)('has an entry for the %s channel', (_name, environment) => {
    expect(Object.keys(ENVIRONMENTS)).toContain(environment.otaChannel!);
  });

  it.each(deployed)('points the %s channel at the host that serves it', (_name, environment) => {
    expect(originFor(environment.otaChannel!, 'ios')).toBe(`https://${environment.apiDomain}`);
  });

  it('has no deployed channel left pointing at a desk', () => {
    for (const [, environment] of deployed) {
      expect(originFor(environment.otaChannel!, 'ios')).not.toContain('localhost');
      expect(originFor(environment.otaChannel!, 'android')).not.toContain('10.0.2.2');
    }
  });
});

describe('the table itself', () => {
  it('never answers with a guess for a channel nobody wrote down', () => {
    expect(originFor('whatever-someone-typed', 'ios')).toBeNull();
  });

  it('reads local as the channel when updates are off', () => {
    // A Metro build reports no channel at all. That is a desk, not a shop.
    expect(originFor(null, 'ios')).toBe(ENVIRONMENTS.local.apiOrigin);
  });

  it('sends Android somewhere it can actually reach on a desk', () => {
    // An emulator's localhost is the emulator.
    expect(originFor('local', 'android')).toBe('http://10.0.2.2:3001');
  });

  it('sends both platforms to the same host once it is a deployment', () => {
    // Only a desk differs by platform; a hosted API is one address.
    for (const channel of ['development', 'production']) {
      expect(originFor(channel, 'android')).toBe(originFor(channel, 'ios'));
      expect(originFor(channel, 'ios')).toMatch(/^https:\/\//);
    }
  });
});

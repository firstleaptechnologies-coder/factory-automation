/**
 * Which server a build talks to, by channel.
 *
 * The channel is baked into the binary — `expo-channel-name` in
 * `ios/Expo.plist` and `android/app/src/main/res/values/strings.xml` — so an
 * over-the-air update cannot repoint a shop's app at a different server. That
 * is the whole reason the choice hangs off the channel rather than off an
 * environment variable inlined into the JS bundle: the bundle is exactly the
 * thing that travels between deployments.
 *
 * `apiOrigin` is null for a deployment that does not exist yet — staging is
 * still one. Nothing falls back to localhost in its place: `environments.spec.ts`
 * fails the build if a binary ships a channel with no server, which is the only
 * moment anyone can still do something about it.
 */
export type Environment = {
  /** Origin the app calls, without the `/api` suffix. Null until it exists. */
  readonly apiOrigin: string | null;
  /**
   * Android's view of the same server, where it differs. An emulator reaches
   * the host machine on 10.0.2.2; a hosted API is the same address for both.
   */
  readonly androidApiOrigin?: string;
};

export const ENVIRONMENTS: Readonly<Record<string, Environment>> = {
  development: {
    apiOrigin: 'http://localhost:3001',
    androidApiOrigin: 'http://10.0.2.2:3001',
  },
  staging: { apiOrigin: null },
  production: { apiOrigin: 'https://api.firstleaptechnologies.in' },
};

/** The channel a build falls back to when updates are off — Metro, and tests. */
export const DEFAULT_CHANNEL = 'development';

/**
 * The origin for a channel on a platform, or null when there is none.
 *
 * An unknown channel is null rather than a guess: a build carrying a channel
 * nobody wrote down is a build nobody can say what it talks to.
 */
export function originFor(channel: string | null, platform: 'ios' | 'android'): string | null {
  const environment = ENVIRONMENTS[channel ?? DEFAULT_CHANNEL];
  if (!environment) return null;
  if (platform === 'android' && environment.androidApiOrigin) {
    return environment.androidApiOrigin;
  }
  return environment.apiOrigin;
}

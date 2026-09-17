/**
 * Which server a build talks to, by channel.
 *
 * The channel is baked into the binary — `expo-channel-name` in
 * `ios/Expo.plist` and `android/app/src/main/res/values/strings.xml` — so an
 * over-the-air update cannot repoint a shop's app at a different server. That
 * is the reason the choice hangs off the channel rather than an environment
 * variable inlined into the JS bundle: the bundle is exactly the thing that
 * travels between deployments.
 *
 * Three worlds, not two:
 *
 *   local        a Metro build on somebody's desk. Updates are off, so
 *                `Updates.channel` is null and this is what that means.
 *   development  the staging deployment, carried by TestFlight and Play
 *                internal builds. Cut from the `development` branch.
 *   production   the shop's own deployment, carried by App Store and Play
 *                production builds. Cut from `main`.
 *
 * The two deployed hosts also live in `deploy/environments.json`, which is what
 * provisions them; `environments.spec.ts` fails if the two lists disagree.
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
  local: {
    apiOrigin: 'http://localhost:3001',
    androidApiOrigin: 'http://10.0.2.2:3001',
  },
  development: { apiOrigin: 'https://api-staging.firstleaptechnologies.in' },
  production: { apiOrigin: 'https://api.firstleaptechnologies.in' },
};

/** The channel a build falls back to when updates are off — Metro, and tests. */
export const DEFAULT_CHANNEL = 'local';

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

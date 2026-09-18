import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { CHANNEL } from '../api/client';

/**
 * Which version of this app is actually running.
 *
 * Three numbers, and they answer different questions:
 *
 *   marketing version   what a person calls it, e.g. "1.0.2"
 *   native build        which binary from the store this is
 *   OTA sequence        which JavaScript bundle that binary has taken since
 *
 * The native build is read from the binary at runtime — CFBundleVersion on
 * iOS, versionCode on Android — and that is the point of it. An update cannot
 * change it, so it is the only honest answer to "which store build is this?".
 * A number baked into the JavaScript at build time would be wrong the moment
 * an update landed: the bundle would be new and the number would describe the
 * binary it was compiled against, not the one running it.
 */

/** The binary's own build number. Zero when it cannot be read, as in Metro. */
export function nativeBuildNumber(): number {
  return Number(Application.nativeBuildVersion ?? 0);
}

/** What the app is called in public — "1.0.2". */
export function marketingVersion(): string {
  return Application.nativeApplicationVersion ?? '?';
}

/**
 * Which JavaScript bundle is running, as a sequence within this channel and
 * runtime. Zero is the bundle that shipped inside the binary — no update taken
 * yet, or a Metro build, which never takes one.
 */
export function otaBuildNumber(): number {
  try {
    const extra = (Updates.manifest as { extra?: Record<string, unknown> } | null)?.extra;
    const build = extra?.otaBuildNumber;
    return typeof build === 'number' ? build : 0;
  } catch {
    return 0;
  }
}

/** The runtime the binary was built for. A bundle for another one cannot run. */
export function runtimeVersion(): string {
  return Updates.runtimeVersion ?? 'unknown';
}

/**
 * One line for a settings screen: "1.0.2 · build 29827684 · OTA 3 · staging".
 *
 * Long, and deliberately so. This is the line somebody reads down a phone when
 * a shop says "it is doing the wrong thing" — and the useful answer is almost
 * always which of these four is not what was expected.
 */
export function versionLabel(): string {
  const ota = otaBuildNumber();
  return [
    marketingVersion(),
    `build ${nativeBuildNumber()}`,
    ota === 0 ? 'no update taken' : `OTA ${ota}`,
    CHANNEL,
  ].join(' · ');
}

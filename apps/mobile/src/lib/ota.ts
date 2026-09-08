import * as Updates from 'expo-updates';

/**
 * Which install this is, for a staged rollout.
 *
 * The server decides who is inside a percentage from a bucket the device sends
 * with every check. It has to be sticky: a device that decided at random on
 * each launch would update, un-update and update again as the number moved.
 * expo-updates persists the extra param itself, so this only ever sets it once.
 *
 * Silent in development, where updates are disabled and there is nothing to
 * bucket.
 */
export async function ensureRolloutBucket(): Promise<void> {
  try {
    if (!Updates.isEnabled) return;
    const params = await Updates.getExtraParamsAsync();
    if (params['rollout-bucket'] == null) {
      await Updates.setExtraParamAsync('rollout-bucket', String(Math.floor(Math.random() * 100)));
    }
  } catch {
    // Not available — a development build, or an older binary. Either way the
    // app carries on; the server falls back to a bucket of its own.
  }
}

/** What the app is running, in the words the release console uses. */
export function runningVersion(): { runtime: string; ota: number | null } {
  const extra = (Updates.manifest as { extra?: Record<string, unknown> } | null)?.extra;
  const build = extra?.otaBuildNumber;
  return {
    runtime: Updates.runtimeVersion ?? 'unknown',
    ota: typeof build === 'number' ? build : null,
  };
}

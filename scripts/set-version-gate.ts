/**
 * Record that a native build exists — without claiming a store is serving it.
 *
 *   npx tsx scripts/set-version-gate.ts \
 *     --platform ios --channel production \
 *     --build 29827484 --versionName 1.2.0 \
 *     --storeUrl https://apps.apple.com/app/id123
 *
 * Run by .github/workflows/post-native-release.yml once an upload succeeds.
 *
 * It deliberately does two things it is not asked to do, and one it is:
 *
 *   it does NOT set latestIsLive. Uploading a binary is not the same as a
 *   store serving it; review takes hours to days and a Play upload lands as a
 *   draft. A person confirms that from the releases screen, and until they do,
 *   no shop is prompted to install something they cannot download.
 *
 *   it does NOT touch minSupportedBuild. Forcing every shop to update is a
 *   decision somebody makes, never a side effect of a deploy.
 *
 * Talks to the API over HTTP, like publish-ota.ts, so the same script serves
 * staging and production without either connection string.
 *
 * Needs: API_URL, PLATFORM_EMAIL, PLATFORM_PASSWORD.
 */

function arg(name: string, fallback?: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && process.argv[at + 1]) return process.argv[at + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing --${name}`);
}

async function main(): Promise<void> {
  const apiUrl = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
  const email = process.env.PLATFORM_EMAIL;
  const password = process.env.PLATFORM_PASSWORD;
  if (!email || !password) {
    throw new Error('PLATFORM_EMAIL and PLATFORM_PASSWORD must both be set');
  }

  const platform = arg('platform');
  const channel = arg('channel');
  const build = Number.parseInt(arg('build'), 10);
  const versionName = arg('versionName', '');
  const storeUrl = arg('storeUrl');

  if (!Number.isFinite(build) || build <= 0) {
    throw new Error(`--build must be a positive number, got "${arg('build')}"`);
  }
  if (platform !== 'ios' && platform !== 'android') {
    throw new Error(`--platform must be ios or android, got "${platform}"`);
  }

  const login = await fetch(`${apiUrl}/api/auth/platform/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) {
    throw new Error(`Could not sign in to ${apiUrl}: ${login.status} ${await login.text()}`);
  }
  const { accessToken } = (await login.json()) as { accessToken: string };

  const response = await fetch(`${apiUrl}/api/platform/releases/gates`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      platform,
      channel,
      latestBuild: build,
      latestVersionName: versionName || undefined,
      storeUrl,
    }),
  });
  if (!response.ok) {
    throw new Error(`Could not write the gate: ${response.status} ${await response.text()}`);
  }

  // eslint-disable-next-line no-console
  console.log(
    `Recorded ${channel}/${platform} build ${build}` +
      (versionName ? ` (${versionName})` : '') +
      ' — not live until somebody confirms the store is serving it.',
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

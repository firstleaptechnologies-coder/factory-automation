/**
 * Put a JavaScript bundle in front of the app, without going near a store.
 *
 *   npx tsx scripts/publish-ota.ts \
 *     --channel production --platform ios --runtime 1.0.0 \
 *     --dir apps/mobile/dist \
 *     --changelog "Fix the punch screen" [--rollout 10] [--publish]
 *
 * Reads what `expo export` produced, uploads the bundle and its assets through
 * the API, and creates a release. A draft by default — somebody looks at it and
 * rolls it out from the console. `--publish` puts it live immediately at
 * `--rollout` percent, which is what CI does for a canary.
 *
 * Talks to the API over HTTP rather than to the database, so the same script
 * publishes to staging and to production without either connection string.
 *
 * Needs: API_URL, PLATFORM_EMAIL, PLATFORM_PASSWORD.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  hbc: 'application/javascript',
  js: 'application/javascript',
  bundle: 'application/javascript',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  json: 'application/json',
  mp4: 'video/mp4',
};

const contentTypeFor = (extension: string): string =>
  CONTENT_TYPES[extension.toLowerCase().replace(/^\./, '')] ?? 'application/octet-stream';

function arg(name: string, fallback?: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && process.argv[at + 1]) return process.argv[at + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing --${name}`);
}

const flag = (name: string) => process.argv.includes(`--${name}`);

async function main(): Promise<void> {
  const apiUrl = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
  const channel = arg('channel');
  const platform = arg('platform');
  const runtimeVersion = arg('runtime');
  const dir = path.resolve(arg('dir', 'apps/mobile/dist'));
  const changelog = arg('changelog', '');
  const rollout = Number.parseInt(arg('rollout', '0'), 10);

  if (platform !== 'ios' && platform !== 'android') {
    throw new Error('--platform must be ios or android');
  }

  const metadataPath = path.join(dir, 'metadata.json');
  if (!existsSync(metadataPath)) {
    throw new Error(`No metadata.json in ${dir} — run \`expo export\` first`);
  }
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  const files = metadata.fileMetadata?.[platform];
  if (!files?.bundle) throw new Error(`metadata.json has no fileMetadata.${platform}.bundle`);

  const token = await signIn(apiUrl);

  /*
   * `extra.expoClient` is the app's own config, which the client expects to
   * find in the manifest. Where the export produced one, it goes along.
   */
  const configPath = path.join(dir, 'expoConfig.json');
  const extra = existsSync(configPath)
    ? { expoClient: JSON.parse(readFileSync(configPath, 'utf8')) }
    : {};

  const release = await post(apiUrl, token, '/api/platform/releases', {
    channel,
    platform,
    runtimeVersion,
    changelog: changelog || undefined,
    extra,
  });

  console.log(`▶ release ${release.id} (OTA ${release.sequence}) — uploading…`);

  await upload(apiUrl, token, release.id, path.join(dir, files.bundle), true);
  for (const asset of files.assets ?? []) {
    await upload(apiUrl, token, release.id, path.join(dir, asset.path), false, `.${asset.ext}`);
  }

  if (flag('publish')) {
    const percent = Math.min(100, Math.max(0, rollout));
    await patch(apiUrl, token, `/api/platform/releases/${release.id}`, {
      status: 'PUBLISHED',
      rolloutPercent: percent,
    });
    console.log(`\n✓ live at ${percent}% — ${release.id}`);
    console.log('  walk it up from the release console once it looks healthy');
  } else {
    console.log(`\n✓ draft — ${release.id}`);
    console.log('  roll it out from the release console');
  }
}

async function signIn(apiUrl: string): Promise<string> {
  const email = process.env.PLATFORM_EMAIL;
  const password = process.env.PLATFORM_PASSWORD;
  if (!email || !password) throw new Error('PLATFORM_EMAIL and PLATFORM_PASSWORD must be set');

  const response = await fetch(`${apiUrl}/api/auth/platform/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Could not sign in: ${response.status}`);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

async function upload(
  apiUrl: string,
  token: string,
  releaseId: string,
  filePath: string,
  isLaunchAsset: boolean,
  extension?: string,
): Promise<void> {
  const bytes = readFileSync(filePath);
  const name = isLaunchAsset
    ? `index${path.extname(filePath) || '.bundle'}`
    : path.basename(filePath) + (path.extname(filePath) ? '' : (extension ?? ''));

  const form = new FormData();
  form.append(
    'file',
    new Blob([bytes], { type: contentTypeFor(path.extname(name) || extension || '') }),
    name,
  );
  form.append('launch', String(isLaunchAsset));

  const response = await fetch(`${apiUrl}/api/platform/releases/${releaseId}/assets`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  if (!response.ok) {
    throw new Error(`Upload of ${name} failed: ${response.status} ${await response.text()}`);
  }
}

async function post(
  apiUrl: string,
  token: string,
  path_: string,
  body: unknown,
): Promise<{ id: string; sequence: number }> {
  const response = await fetch(`${apiUrl}${path_}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path_} failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as { id: string; sequence: number };
}

async function patch(apiUrl: string, token: string, path_: string, body: unknown): Promise<void> {
  const response = await fetch(`${apiUrl}${path_}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path_} failed: ${response.status} ${await response.text()}`);
}

main().catch((error) => {
  console.error('✗ publish failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

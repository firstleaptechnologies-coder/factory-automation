import { randomBytes } from 'crypto';
import { buildSignatureHeader, createHash, isCodeSigningConfigured } from './signing';

/**
 * Expo Updates protocol v1 responses.
 *
 * The client asks with a set of headers and gets back a `multipart/mixed` body
 * holding either a manifest — this is the update, here is its bundle and its
 * assets — or a directive: there is nothing newer, or go back to what the store
 * binary shipped with.
 */

export interface ManifestAsset {
  key: string;
  contentType: string;
  url: string;
  hash: string;
  fileExtension: string;
}

export interface ManifestInput {
  id: string;
  createdAt: Date;
  runtimeVersion: string;
  sequence: number;
  metadata: unknown;
  extra: unknown;
  launchAsset: ManifestAsset;
  assets: ManifestAsset[];
}

export function buildManifest(release: ManifestInput) {
  return {
    id: release.id,
    createdAt: release.createdAt.toISOString(),
    runtimeVersion: release.runtimeVersion,
    launchAsset: release.launchAsset,
    assets: release.assets,
    metadata: (release.metadata as Record<string, unknown>) ?? {},
    extra: {
      ...((release.extra as Record<string, unknown>) ?? {}),
      // Read by the app to show "OTA 7" beside the version, so somebody on the
      // floor can say which build they are on.
      otaBuildNumber: release.sequence,
    },
  };
}

export function noUpdateAvailableDirective(): string {
  return JSON.stringify({ type: 'noUpdateAvailable' });
}

export function rollBackToEmbeddedDirective(commitTime: string): string {
  return JSON.stringify({ type: 'rollBackToEmbedded', parameters: { commitTime } });
}

export type PartName = 'manifest' | 'directive' | 'extensions';

export interface Part {
  name: PartName;
  body: string;
  /** Sign this part when signing is configured. */
  sign: boolean;
}

export interface MultipartResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Assemble the `multipart/mixed` body.
 *
 * The boundary in the header has to match the parts, each part is named so the
 * client can find it, and a signed part's header covers the exact body written
 * below it.
 */
export function buildMultipartResponse(parts: Part[]): MultipartResponse {
  const boundary = `expo-${randomBytes(12).toString('hex')}`;
  const signing = isCodeSigningConfigured();
  let body = '';

  for (const part of parts) {
    body += `--${boundary}\r\n`;
    body += 'Content-Type: application/json; charset=utf-8\r\n';
    body += `Content-Disposition: form-data; name="${part.name}"\r\n`;
    if (part.sign && signing) {
      body += `expo-signature: ${buildSignatureHeader(part.body)}\r\n`;
    }
    body += `\r\n${part.body}\r\n`;
  }
  body += `--${boundary}--\r\n`;

  return {
    status: 200,
    headers: {
      'expo-protocol-version': '1',
      'expo-sfv-version': '0',
      'cache-control': 'private, max-age=0',
      'content-type': `multipart/mixed; boundary=${boundary}`,
    },
    body,
  };
}

/** Deterministic include or exclude for a staged rollout. Buckets are 0–99. */
export function isInRollout(bucket: number, rolloutPercent: number): boolean {
  if (rolloutPercent >= 100) return true;
  if (rolloutPercent <= 0) return false;
  return bucket < rolloutPercent;
}

/**
 * The install's own rollout bucket, sent back to us on every check.
 *
 * Sticky per install, which is the whole point: without it a device would be
 * inside a 20% rollout on one launch and outside it on the next, updating and
 * un-updating itself.
 */
export function parseRolloutBucket(extraParams: string | null): number | null {
  if (!extraParams) return null;
  const match = /rollout-bucket\s*=\s*"?(\d{1,3})"?/i.exec(extraParams);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? Math.min(99, Math.max(0, value)) : null;
}

/** A stable bucket for an install that did not send one. */
export function deterministicBucket(seed: string): number {
  const hex = createHash(seed, 'sha256', 'hex').slice(0, 8);
  return Number.parseInt(hex, 16) % 100;
}

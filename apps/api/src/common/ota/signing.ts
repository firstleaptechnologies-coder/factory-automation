import crypto, { type BinaryLike, type BinaryToTextEncoding } from 'crypto';

/**
 * Hashing and code signing for the update server.
 *
 * Ported from Expo's reference `custom-expo-updates-server` so the byte-level
 * behaviour matches what the embedded client verifies. This is not a place to
 * be clever: a signature the client cannot check is an app that refuses every
 * update, and the failure looks like nothing at all.
 *
 * Two hashes per asset, and they must not be conflated:
 *   - `hash` = base64url(SHA-256(bytes)) — the client's integrity check
 *   - `key`  = hex(MD5(bytes))           — the asset's stable identifier
 */

export function createHash(
  data: BinaryLike,
  algorithm: string,
  encoding: BinaryToTextEncoding,
): string {
  return crypto.createHash(algorithm).update(data).digest(encoding);
}

/** Standard base64 → base64url (RFC 4648 §5). */
export function toBase64URL(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url SHA-256 of the bytes — the manifest asset `hash`. */
export function assetHash(data: BinaryLike): string {
  return toBase64URL(createHash(data, 'sha256', 'base64'));
}

/** hex MD5 of the bytes — the manifest asset `key`. */
export function assetKey(data: BinaryLike): string {
  return createHash(data, 'md5', 'hex');
}

/** Format a 32-character SHA-256 hex slice as a UUID. */
export function sha256HexToUUID(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/*
 * Must match what the app was built with: `expo-updates codesigning:configure`
 * writes these into app.json and Expo.plist.
 */
const KEY_ID = 'main';
const ALG = 'rsa-v1_5-sha256';

function privateKeyPem(): string | null {
  const raw = process.env.EXPO_OTA_PRIVATE_KEY;
  if (!raw) return null;
  // Deployment environments store the PEM with literal "\n".
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

/**
 * Signing is on only when the key is present.
 *
 * Deliberately optional: development and staging run unsigned, and the client
 * only insists on a signature when it was built to. A missing key must not stop
 * the API booting — it stops updates being signed, and says so.
 */
export function isCodeSigningConfigured(): boolean {
  return Boolean(privateKeyPem());
}

/**
 * RSA-SHA256 (RSASSA-PKCS1-v1_5) over a UTF-8 body, standard base64 out —
 * not base64url. The bytes signed must be exactly the string written into the
 * multipart part, or verification fails on a whitespace or key-order
 * difference that nothing will point at.
 */
export function signRSASHA256(body: string): string {
  const key = privateKeyPem();
  if (!key) throw new Error('EXPO_OTA_PRIVATE_KEY is not configured');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(body, 'utf8');
  sign.end();
  return sign.sign(key, 'base64');
}

/** The `expo-signature` structured-field header for a signed part. */
export function buildSignatureHeader(body: string): string {
  return `sig="${signRSASHA256(body)}", keyid="${KEY_ID}", alg="${ALG}"`;
}

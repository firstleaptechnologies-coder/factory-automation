import { generateKeyPairSync, createVerify } from 'crypto';
import {
  assetHash,
  assetKey,
  buildSignatureHeader,
  isCodeSigningConfigured,
  sha256HexToUUID,
  signRSASHA256,
  toBase64URL,
} from './signing';

const BYTES = Buffer.from('the bundle');

afterEach(() => {
  delete process.env.EXPO_OTA_PRIVATE_KEY;
});

describe('the two hashes', () => {
  it('are not the same hash, and must not be confused', () => {
    // key is hex MD5, hash is base64url SHA-256. The client checks one and
    // identifies by the other.
    expect(assetKey(BYTES)).toMatch(/^[0-9a-f]{32}$/);
    expect(assetHash(BYTES)).not.toMatch(/^[0-9a-f]{32}$/);
  });

  it('write base64 the way a URL can carry it', () => {
    expect(toBase64URL('ab+/cd==')).toBe('ab-_cd');
    expect(assetHash(BYTES)).not.toMatch(/[+/=]/);
  });

  it('are stable for the same bytes', () => {
    expect(assetKey(Buffer.from('same'))).toBe(assetKey(Buffer.from('same')));
    expect(assetHash(Buffer.from('same'))).toBe(assetHash(Buffer.from('same')));
  });

  it('shapes a hash into a manifest id', () => {
    expect(sha256HexToUUID('0123456789abcdef0123456789abcdef')).toBe(
      '01234567-89ab-cdef-0123-456789abcdef',
    );
  });
});

describe('code signing', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  it('is off until a key is configured', () => {
    expect(isCodeSigningConfigured()).toBe(false);
    // Development and staging run unsigned; a missing key must not stop the
    // API booting.
    expect(() => signRSASHA256('{}')).toThrow(/not configured/);
  });

  it('signs what the client will verify, byte for byte', () => {
    process.env.EXPO_OTA_PRIVATE_KEY = privateKey;
    const body = '{"id":"abc"}';

    const header = buildSignatureHeader(body);
    const signature = /sig="([^"]+)"/.exec(header)![1];

    const verify = createVerify('RSA-SHA256');
    verify.update(body, 'utf8');
    verify.end();
    expect(verify.verify(publicKey, signature, 'base64')).toBe(true);
  });

  it('names the key and the algorithm the app was built with', () => {
    process.env.EXPO_OTA_PRIVATE_KEY = privateKey;
    const header = buildSignatureHeader('{}');
    expect(header).toContain('keyid="main"');
    expect(header).toContain('alg="rsa-v1_5-sha256"');
  });

  it('restores a PEM stored with literal newlines', () => {
    // Deployment environments store it that way; without this every signature
    // fails with nothing pointing at why.
    process.env.EXPO_OTA_PRIVATE_KEY = privateKey.replace(/\n/g, '\\n');
    expect(() => signRSASHA256('{}')).not.toThrow();
  });
});

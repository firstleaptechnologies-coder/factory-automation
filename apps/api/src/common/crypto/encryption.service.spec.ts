import { randomBytes } from 'node:crypto';
import { DecryptionError, EncryptionService } from './encryption.service';

const KEY_A = randomBytes(32).toString('base64');
const KEY_B = randomBytes(32).toString('base64');

function build(env: Record<string, string | undefined> = {}) {
  const config = { get: (key: string) => env[key] };
  const service = new EncryptionService(config as never);
  service.onModuleInit();
  return service;
}

describe('key loading', () => {
  it('writes with the first key listed', () => {
    const service = build({ ENCRYPTION_KEYS: `k2:${KEY_B},k1:${KEY_A}` });
    expect(service.activeKeyId).toBe('k2');
  });

  it('derives a development key when none is configured', () => {
    const service = build({ NODE_ENV: 'development' });
    expect(service.activeKeyId).toBe('dev');
    expect(service.decrypt(service.encrypt('hello')).toString()).toBe('hello');
  });

  it('refuses to start in production without keys', () => {
    const config = { get: (key: string) => (key === 'NODE_ENV' ? 'production' : undefined) };
    // A derived key means anyone with the repo can read the data.
    expect(() => new EncryptionService(config as never).onModuleInit()).toThrow(
      /must be set in production/,
    );
  });

  it('refuses a key that is not 32 bytes, and says how long it was', () => {
    const short = randomBytes(16).toString('base64');
    expect(() => build({ ENCRYPTION_KEYS: `k1:${short}` })).toThrow(/got 16/);
  });

  it('refuses an entry with no key id', () => {
    expect(() => build({ ENCRYPTION_KEYS: KEY_A })).toThrow(/keyId:base64key/);
  });
});

describe('round trip', () => {
  const service = build({ ENCRYPTION_KEYS: `k1:${KEY_A}` });

  it('recovers text', () => {
    expect(service.decryptToString(service.encrypt('Verma Interiors'))).toBe('Verma Interiors');
  });

  it('recovers bytes exactly', () => {
    const data = randomBytes(4096);
    expect(service.decrypt(service.encrypt(data)).equals(data)).toBe(true);
  });

  it('handles empty input', () => {
    expect(service.decrypt(service.encrypt(Buffer.alloc(0))).length).toBe(0);
  });

  it('handles non-ASCII text', () => {
    expect(service.decryptToString(service.encrypt('₹47,200 — साइट'))).toBe('₹47,200 — साइट');
  });

  it('produces a different envelope every time, so the IV is never reused', () => {
    // Reusing an IV with the same key under GCM breaks the cipher completely.
    const a = service.encrypt('same');
    const b = service.encrypt('same');
    expect(a).not.toBe(b);
    expect(a.split('.')[2]).not.toBe(b.split('.')[2]);
  });

  it('stamps the writing key id into the envelope', () => {
    expect(service.encrypt('x').split('.')[1]).toBe('k1');
  });
});

describe('tampering', () => {
  const service = build({ ENCRYPTION_KEYS: `k1:${KEY_A}` });

  it('rejects a modified ciphertext rather than returning wrong bytes', () => {
    const parts = service.encrypt('₹40,000 received').split('.');
    const data = Buffer.from(parts[4], 'base64url');
    data[0] ^= 0xff;
    parts[4] = data.toString('base64url');
    expect(() => service.decrypt(parts.join('.'))).toThrow(DecryptionError);
  });

  it('rejects a swapped auth tag', () => {
    const parts = service.encrypt('a').split('.');
    parts[3] = Buffer.from(service.encrypt('b').split('.')[3], 'base64url').toString('base64url');
    expect(() => service.decrypt(parts.join('.'))).toThrow(DecryptionError);
  });

  it('does not say whether the key was wrong or the bytes were changed', () => {
    const parts = service.encrypt('x').split('.');
    const data = Buffer.from(parts[4], 'base64url');
    data[0] ^= 0x01;
    parts[4] = data.toString('base64url');
    // That distinction is useful to an attacker.
    expect(() => service.decrypt(parts.join('.'))).toThrow(/corrupt or was tampered with/);
  });

  it('rejects an envelope with the wrong number of parts', () => {
    expect(() => service.decrypt('v1.k1.abc')).toThrow(/Malformed ciphertext envelope/);
  });

  it('rejects an unknown version', () => {
    const parts = service.encrypt('x').split('.');
    parts[0] = 'v9';
    expect(() => service.decrypt(parts.join('.'))).toThrow(/Unsupported ciphertext version/);
  });

  it('rejects a truncated IV', () => {
    const parts = service.encrypt('x').split('.');
    parts[2] = Buffer.alloc(4).toString('base64url');
    expect(() => service.decrypt(parts.join('.'))).toThrow(/Malformed IV or auth tag/);
  });
});

describe('key rotation', () => {
  it('reads data written under an older key', () => {
    const old = build({ ENCRYPTION_KEYS: `k1:${KEY_A}` });
    const envelope = old.encrypt('punched last year');

    // k2 added in front: new writes use it, old data still decrypts.
    const rotated = build({ ENCRYPTION_KEYS: `k2:${KEY_B},k1:${KEY_A}` });
    expect(rotated.activeKeyId).toBe('k2');
    expect(rotated.decryptToString(envelope)).toBe('punched last year');
  });

  it('says which key is missing when one was dropped from the config', () => {
    const old = build({ ENCRYPTION_KEYS: `k1:${KEY_A}` });
    const envelope = old.encrypt('x');
    const withoutK1 = build({ ENCRYPTION_KEYS: `k2:${KEY_B}` });
    expect(() => withoutK1.decrypt(envelope)).toThrow(/No encryption key "k1"/);
  });
});

describe('isEncrypted', () => {
  const service = build({ ENCRYPTION_KEYS: `k1:${KEY_A}` });

  it('recognises our own envelopes', () => {
    expect(service.isEncrypted(service.encrypt('x'))).toBe(true);
  });

  it('treats plaintext, null and undefined as not encrypted', () => {
    expect(service.isEncrypted('just text')).toBe(false);
    expect(service.isEncrypted(null)).toBe(false);
    expect(service.isEncrypted(undefined)).toBe(false);
  });
});

describe('checksum and safeEqual', () => {
  it('is stable for the same bytes and differs for others', () => {
    const a = EncryptionService.checksum(Buffer.from('abc'));
    expect(EncryptionService.checksum(Buffer.from('abc'))).toBe(a);
    expect(EncryptionService.checksum(Buffer.from('abd'))).not.toBe(a);
    expect(a).toHaveLength(64);
  });

  it('compares equal strings', () => {
    expect(EncryptionService.safeEqual('token', 'token')).toBe(true);
  });

  it('returns false for different lengths without throwing', () => {
    // timingSafeEqual itself throws on a length mismatch; the guard matters.
    expect(EncryptionService.safeEqual('token', 'tok')).toBe(false);
  });

  it('returns false for same-length differences', () => {
    expect(EncryptionService.safeEqual('token', 'tokes')).toBe(false);
  });
});

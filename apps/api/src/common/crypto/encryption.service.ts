import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

/**
 * The single encryption entry point for the whole system.
 *
 * Everything that needs protecting — file bytes, and any column we later decide
 * to encrypt — goes through `encrypt` and `decrypt` here. One implementation
 * means one place to audit, and one place to fix.
 *
 * Algorithm: AES-256-GCM. GCM is *authenticated*: decryption fails loudly if
 * the ciphertext was altered, rather than quietly returning wrong bytes. That
 * matters more than raw speed for order photos and client data. A fresh random
 * 96-bit IV is generated per call — never reuse an IV with the same key under
 * GCM, it breaks the cipher completely.
 *
 * Envelope layout (versioned so the format can change without a data migration):
 *
 *     v1.<keyId>.<iv-b64url>.<authTag-b64url>.<ciphertext-b64url>
 *
 * Key material comes from ENCRYPTION_KEYS as `keyId:base64key` pairs, newest
 * first. New data is encrypted with the first key; old data keeps decrypting
 * with whichever key wrote it, so rotating a key is a config change, not a
 * re-encryption run.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const VERSION = 'v1';

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly keys = new Map<string, Buffer>();
  private primaryKeyId!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.loadKeys();
  }

  /** Key id that new data will be encrypted under. Store it beside the data. */
  get activeKeyId(): string {
    if (!this.primaryKeyId) this.loadKeys();
    return this.primaryKeyId;
  }

  /**
   * Encrypt bytes or text. Returns a self-describing string that carries
   * everything decryption needs except the key itself.
   */
  encrypt(plaintext: string | Buffer): string {
    const key = this.keyFor(this.activeKeyId);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const input = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
    const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
      VERSION,
      this.activeKeyId,
      b64url(iv),
      b64url(authTag),
      b64url(ciphertext),
    ].join('.');
  }

  /** Decrypt an envelope produced by `encrypt`. Throws if it was tampered with. */
  decrypt(envelope: string): Buffer {
    const parts = envelope.split('.');
    if (parts.length !== 5) {
      throw new DecryptionError('Malformed ciphertext envelope');
    }

    const [version, keyId, ivB64, tagB64, dataB64] = parts;
    if (version !== VERSION) {
      throw new DecryptionError(`Unsupported ciphertext version "${version}"`);
    }

    const key = this.keyFor(keyId);
    const iv = fromB64url(ivB64);
    const authTag = fromB64url(tagB64);
    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      throw new DecryptionError('Malformed IV or auth tag');
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    try {
      return Buffer.concat([decipher.update(fromB64url(dataB64)), decipher.final()]);
    } catch {
      // GCM's tag check failed: wrong key, or the bytes were modified. Never
      // leak which — that distinction is useful to an attacker.
      throw new DecryptionError('Could not decrypt: data is corrupt or was tampered with');
    }
  }

  decryptToString(envelope: string): string {
    return this.decrypt(envelope).toString('utf8');
  }

  /** True when a value looks like one of our envelopes rather than plaintext. */
  isEncrypted(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(`${VERSION}.`);
  }

  /** Content hash, used for integrity checks and de-duplicating uploads. */
  static checksum(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /** Constant-time compare, for anything secret-adjacent. */
  static safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  // -- keys -----------------------------------------------------------------

  private keyFor(keyId: string): Buffer {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new DecryptionError(
        `No encryption key "${keyId}" is configured — it may have been removed from ENCRYPTION_KEYS`,
      );
    }
    return key;
  }

  private loadKeys(): void {
    const raw = this.config.get<string>('ENCRYPTION_KEYS')?.trim();

    if (!raw) {
      // Development convenience only. A derived key means anyone with the repo
      // can read the data, so refuse it outside development.
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new Error(
          'ENCRYPTION_KEYS must be set in production. Generate one with: ' +
            'node -e "console.log(\'k1:\' + require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
        );
      }
      this.logger.warn(
        'ENCRYPTION_KEYS is not set — deriving an insecure development key. Do not use this with real data.',
      );
      this.keys.set('dev', scryptSync('decor-bucket-development', 'decor-bucket', KEY_BYTES));
      this.primaryKeyId = 'dev';
      return;
    }

    // "k2:<base64>,k1:<base64>" — first entry encrypts, all entries decrypt.
    for (const entry of raw.split(',')) {
      const separator = entry.indexOf(':');
      if (separator < 1) {
        throw new Error(`Malformed ENCRYPTION_KEYS entry: expected "keyId:base64key"`);
      }
      const keyId = entry.slice(0, separator).trim();
      const key = Buffer.from(entry.slice(separator + 1).trim(), 'base64');

      if (key.length !== KEY_BYTES) {
        throw new Error(
          `Encryption key "${keyId}" must be exactly ${KEY_BYTES} bytes (got ${key.length}). ` +
            'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
        );
      }
      this.keys.set(keyId, key);
      this.primaryKeyId ??= keyId;
    }

    this.logger.log(
      `Encryption ready: ${this.keys.size} key(s), writing with "${this.primaryKeyId}"`,
    );
  }
}

function b64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function fromB64url(text: string): Buffer {
  return Buffer.from(text, 'base64url');
}

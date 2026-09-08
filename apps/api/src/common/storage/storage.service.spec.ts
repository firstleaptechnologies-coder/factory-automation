import { NotFoundException } from '@nestjs/common';
import { StorageBackend } from '@prisma/client';
import { StorageService } from './storage.service';

const sent: unknown[] = [];

/**
 * The S3 client is created in the constructor, so it is faked at the module
 * boundary rather than injected. Each command records what it was asked to do.
 */
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    async send(command: { name: string; input: Record<string, unknown> }) {
      sent.push(command);
      if (command.name === 'GetObject') {
        return {
          Body: { transformToByteArray: async () => new Uint8Array(Buffer.from('from-s3')) },
        };
      }
      return {};
    }
  },
  PutObjectCommand: class {
    name = 'PutObject';
    constructor(public input: Record<string, unknown>) {}
  },
  GetObjectCommand: class {
    name = 'GetObject';
    constructor(public input: Record<string, unknown>) {}
  },
  DeleteObjectCommand: class {
    name = 'DeleteObject';
    constructor(public input: Record<string, unknown>) {}
  },
}));

const encryption = {
  encrypt: jest.fn((data: Buffer | string) => `v1.k1.iv.tag.${Buffer.from(data).toString('hex')}`),
  decrypt: jest.fn((envelope: string) => Buffer.from(envelope.split('.')[4], 'hex')),
  activeKeyId: 'k1',
};

const S3_ENV: Record<string, string> = {
  S3_BUCKET: 'decor',
  S3_REGION: 'ap-south-1',
  S3_ACCESS_KEY_ID: 'id',
  S3_SECRET_ACCESS_KEY: 'secret',
};

function build(env: Record<string, string> = {}) {
  const config = { get: (key: string) => env[key] };
  return new StorageService(config as never, encryption as never);
}

beforeEach(() => {
  sent.length = 0;
  jest.clearAllMocks();
});

describe('backend choice', () => {
  it('reports S3 as unavailable when it is not configured', () => {
    expect(build().s3Available).toBe(false);
  });

  it('reports S3 as available once every setting is present', () => {
    expect(build(S3_ENV).s3Available).toBe(true);
  });

  it('keeps everything in the database without S3, however large', async () => {
    const stored = await build().put(Buffer.alloc(10 * 1024 * 1024), {
      fileName: 'big.webp',
      mimeType: 'image/webp',
    });
    expect(stored.backend).toBe(StorageBackend.DATABASE);
  });

  it('keeps a small file in the database even with S3 configured', async () => {
    const stored = await build(S3_ENV).put(Buffer.from('small'), {
      fileName: 'a.webp',
      mimeType: 'image/webp',
    });
    // An optimised photo inside the same backup and transaction as the order
    // row is worth more than the row-size saving.
    expect(stored.backend).toBe(StorageBackend.DATABASE);
    expect(sent).toHaveLength(0);
  });

  it('pushes a file over the threshold out to S3', async () => {
    const stored = await build({ ...S3_ENV, STORAGE_DB_MAX_BYTES: '10' }).put(
      Buffer.alloc(100),
      { fileName: 'a.webp', mimeType: 'image/webp' },
    );
    expect(stored.backend).toBe(StorageBackend.S3);
    expect(stored.bucket).toBe('decor');
  });

  it('falls back to the database rather than losing an upload S3 cannot take', async () => {
    const stored = await build().put(Buffer.from('x'), {
      fileName: 'a.webp',
      mimeType: 'image/webp',
      backend: StorageBackend.S3,
    });
    expect(stored.backend).toBe(StorageBackend.DATABASE);
  });

  it('honours an explicit database request for a large file', async () => {
    const stored = await build({ ...S3_ENV, STORAGE_DB_MAX_BYTES: '10' }).put(
      Buffer.alloc(100),
      { fileName: 'a.webp', mimeType: 'image/webp', backend: StorageBackend.DATABASE },
    );
    expect(stored.backend).toBe(StorageBackend.DATABASE);
  });
});

describe('put', () => {
  it('always encrypts database bytes', async () => {
    const stored = await build().put(Buffer.from('secret'), {
      fileName: 'a.webp',
      mimeType: 'image/webp',
    });
    // A database dump must not be a folder of client drawings.
    expect(stored.isEncrypted).toBe(true);
    expect(stored.encryptionKeyId).toBe('k1');
    expect(stored.data!.toString()).toContain('v1.k1');
  });

  it('records the plaintext size, not the envelope size', async () => {
    const stored = await build().put(Buffer.alloc(500), {
      fileName: 'a.webp',
      mimeType: 'image/webp',
    });
    expect(stored.byteSize).toBe(500);
  });

  it('checksums the plaintext', async () => {
    const stored = await build().put(Buffer.from('abc'), {
      fileName: 'a.webp',
      mimeType: 'image/webp',
    });
    expect(stored.checksum).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('declares the S3 object as ciphertext, not as a JPEG', async () => {
    await build({ ...S3_ENV, STORAGE_DB_MAX_BYTES: '1' }).put(Buffer.alloc(10), {
      fileName: 'a.jpg',
      mimeType: 'image/jpeg',
    });
    const put = sent[0] as { input: Record<string, string> };
    // Anything fetching the object directly must not treat ciphertext as an image.
    expect(put.input.ContentType).toBe('application/octet-stream');
  });

  it('declares the real type when encryption is turned off', async () => {
    await build({ ...S3_ENV, STORAGE_DB_MAX_BYTES: '1' }).put(Buffer.alloc(10), {
      fileName: 'a.jpg',
      mimeType: 'image/jpeg',
      encrypt: false,
    });
    const put = sent[0] as { input: Record<string, string> };
    expect(put.input.ContentType).toBe('image/jpeg');
  });

  it('builds a dated, sanitised object key', async () => {
    await build({ ...S3_ENV, STORAGE_DB_MAX_BYTES: '1' }).put(Buffer.alloc(10), {
      fileName: 'site photo (1).jpg',
      mimeType: 'image/jpeg',
    });
    const key = (sent[0] as { input: { Key: string } }).input.Key;
    expect(key).toMatch(/^orders\/\d{4}\/\d{2}\/[0-9a-f]{16}-site_photo__1_\.jpg$/);
  });

  it('takes a caller-supplied prefix', async () => {
    await build({ ...S3_ENV, STORAGE_DB_MAX_BYTES: '1' }).put(Buffer.alloc(10), {
      fileName: 'a.jpg',
      mimeType: 'image/jpeg',
      keyPrefix: 'letterheads',
    });
    expect((sent[0] as { input: { Key: string } }).input.Key).toMatch(/^letterheads\//);
  });

  it('url-encodes the original name into the metadata', async () => {
    await build({ ...S3_ENV, STORAGE_DB_MAX_BYTES: '1' }).put(Buffer.alloc(10), {
      fileName: 'साइट.jpg',
      mimeType: 'image/jpeg',
    });
    const meta = (sent[0] as { input: { Metadata: Record<string, string> } }).input.Metadata;
    expect(meta.originalName).toBe(encodeURIComponent('साइट.jpg'));
  });
});

describe('read', () => {
  it('decrypts database bytes', async () => {
    const service = build();
    const stored = await service.put(Buffer.from('hello'), {
      fileName: 'a.webp',
      mimeType: 'image/webp',
    });
    const back = await service.read({
      backend: StorageBackend.DATABASE,
      data: stored.data,
      isEncrypted: true,
    });
    expect(back.toString()).toBe('hello');
  });

  it('returns unencrypted database bytes as they are', async () => {
    const back = await build().read({
      backend: StorageBackend.DATABASE,
      data: Buffer.from('raw'),
      isEncrypted: false,
    });
    expect(back.toString()).toBe('raw');
  });

  it('reports a database row with no bytes', async () => {
    await expect(
      build().read({ backend: StorageBackend.DATABASE, data: null, isEncrypted: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('says plainly when a file lives in S3 that is not configured', async () => {
    await expect(
      build().read({ backend: StorageBackend.S3, objectKey: 'k', isEncrypted: true }),
    ).rejects.toThrow(/S3, which is not configured/);
  });

  it('reports an S3 row with no object key', async () => {
    await expect(
      build(S3_ENV).read({ backend: StorageBackend.S3, objectKey: null, isEncrypted: true }),
    ).rejects.toThrow(/no object key/);
  });

  it('fetches and decrypts from S3', async () => {
    const back = await build(S3_ENV).read({
      backend: StorageBackend.S3,
      objectKey: 'orders/2026/09/abc-a.jpg',
      isEncrypted: false,
    });
    expect(back.toString()).toBe('from-s3');
  });

  it('reads from the bucket recorded on the row, not today’s default', async () => {
    await build(S3_ENV).read({
      backend: StorageBackend.S3,
      bucket: 'old-bucket',
      objectKey: 'k',
      isEncrypted: false,
    });
    expect((sent[0] as { input: { Bucket: string } }).input.Bucket).toBe('old-bucket');
  });
});

describe('delete', () => {
  it('does nothing for a database-backed file', async () => {
    await build(S3_ENV).delete({ backend: StorageBackend.DATABASE, objectKey: null });
    expect(sent).toHaveLength(0);
  });

  it('does nothing when S3 is not configured', async () => {
    await build().delete({ backend: StorageBackend.S3, objectKey: 'k' });
    expect(sent).toHaveLength(0);
  });

  it('deletes the object when it can', async () => {
    await build(S3_ENV).delete({ backend: StorageBackend.S3, objectKey: 'k' });
    expect((sent[0] as { name: string }).name).toBe('DeleteObject');
  });
});

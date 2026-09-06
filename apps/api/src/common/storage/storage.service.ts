import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { StorageBackend } from '@prisma/client';
import { EncryptionService } from '../crypto/encryption.service';

export interface StoredObject {
  backend: StorageBackend;
  bucket?: string;
  objectKey?: string;
  /** Populated for the DATABASE backend; the caller writes it to the row. */
  data?: Buffer;
  byteSize: number;
  checksum: string;
  isEncrypted: boolean;
  encryptionKeyId?: string;
}

export interface PutOptions {
  fileName: string;
  mimeType: string;
  /** Force a backend; otherwise size decides. */
  backend?: StorageBackend;
  /** Encrypt at rest. Always on for the DATABASE backend. */
  encrypt?: boolean;
  keyPrefix?: string;
}

/**
 * One interface over two backends.
 *
 * Postgres holds small files: a few hundred KB of optimised photo per order is
 * nothing next to the operational win of having the images inside the same
 * backup and the same transaction as the order row. Large files go to S3, where
 * a 5 MB blob belongs.
 *
 * Callers never branch on this. They hand over bytes and get back a descriptor;
 * `read` puts it back together from whichever side it landed on.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string | undefined;

  /**
   * Above this, a file goes to S3 rather than into a Postgres row. Large
   * bytea values bloat the table, slow sequential scans and inflate every
   * backup — keep the common case (an optimised photo) in the database and
   * push the outliers out.
   */
  private readonly databaseMaxBytes: number;

  constructor(
    private readonly config: ConfigService,
    private readonly encryption: EncryptionService,
  ) {
    this.bucket = config.get<string>('S3_BUCKET');
    this.databaseMaxBytes = Number(config.get<string>('STORAGE_DB_MAX_BYTES') ?? 1024 * 1024);

    const region = config.get<string>('S3_REGION');
    const accessKeyId = config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('S3_SECRET_ACCESS_KEY');

    if (this.bucket && region && accessKeyId && secretAccessKey) {
      this.s3 = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
        // Set for MinIO, Cloudflare R2 and other S3-compatible endpoints.
        endpoint: config.get<string>('S3_ENDPOINT') || undefined,
        forcePathStyle: config.get<string>('S3_FORCE_PATH_STYLE') === 'true',
      });
      this.logger.log(`S3 storage ready (bucket ${this.bucket})`);
    } else {
      this.s3 = null;
      this.logger.warn(
        'S3 is not configured — every file will be stored in the database. Set S3_BUCKET, S3_REGION and credentials to enable it.',
      );
    }
  }

  get s3Available(): boolean {
    return this.s3 !== null;
  }

  async put(data: Buffer, options: PutOptions): Promise<StoredObject> {
    const checksum = EncryptionService.checksum(data);
    const backend = this.chooseBackend(data.byteLength, options.backend);

    if (backend === StorageBackend.DATABASE) {
      // Bytes inside our own database are always encrypted: it costs little and
      // means a database dump is not a folder of client drawings.
      const envelope = this.encryption.encrypt(data);
      return {
        backend,
        data: Buffer.from(envelope, 'utf8'),
        byteSize: data.byteLength,
        checksum,
        isEncrypted: true,
        encryptionKeyId: this.encryption.activeKeyId,
      };
    }

    const objectKey = this.buildKey(options.keyPrefix, checksum, options.fileName);
    const encrypt = options.encrypt ?? true;
    const body = encrypt ? Buffer.from(this.encryption.encrypt(data), 'utf8') : data;

    await this.s3!.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        // The stored bytes are our envelope, so declare that rather than the
        // original type — anything fetching the object directly must not treat
        // ciphertext as a JPEG.
        ContentType: encrypt ? 'application/octet-stream' : options.mimeType,
        Metadata: { checksum, originalName: encodeURIComponent(options.fileName) },
      }),
    );

    return {
      backend,
      bucket: this.bucket,
      objectKey,
      byteSize: data.byteLength,
      checksum,
      isEncrypted: encrypt,
      encryptionKeyId: encrypt ? this.encryption.activeKeyId : undefined,
    };
  }

  /** Fetch and decrypt, whichever backend holds it. */
  async read(file: {
    backend: StorageBackend;
    bucket?: string | null;
    objectKey?: string | null;
    data?: Buffer | Uint8Array | null;
    isEncrypted: boolean;
  }): Promise<Buffer> {
    if (file.backend === StorageBackend.DATABASE) {
      if (!file.data) throw new NotFoundException('File contents are missing');
      const stored = Buffer.from(file.data);
      return file.isEncrypted
        ? this.encryption.decrypt(stored.toString('utf8'))
        : stored;
    }

    if (!this.s3) {
      throw new NotFoundException('This file lives in S3, which is not configured');
    }
    if (!file.objectKey) throw new NotFoundException('File has no object key');

    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: file.bucket ?? this.bucket,
        Key: file.objectKey,
      }),
    );

    const bytes = Buffer.from(await response.Body!.transformToByteArray());
    return file.isEncrypted ? this.encryption.decrypt(bytes.toString('utf8')) : bytes;
  }

  async delete(file: {
    backend: StorageBackend;
    bucket?: string | null;
    objectKey?: string | null;
  }): Promise<void> {
    if (file.backend !== StorageBackend.S3 || !this.s3 || !file.objectKey) return;
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: file.bucket ?? this.bucket,
        Key: file.objectKey,
      }),
    );
  }

  private chooseBackend(byteSize: number, requested?: StorageBackend): StorageBackend {
    if (requested === StorageBackend.S3 && !this.s3) {
      // Falling back is better than losing the upload; the log says it happened.
      this.logger.warn('S3 was requested but is not configured — storing in the database');
      return StorageBackend.DATABASE;
    }
    if (requested) return requested;
    if (byteSize > this.databaseMaxBytes && this.s3) return StorageBackend.S3;
    return StorageBackend.DATABASE;
  }

  private buildKey(prefix: string | undefined, checksum: string, fileName: string): string {
    const now = new Date();
    const datePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
    return [prefix ?? 'orders', datePath, `${checksum.slice(0, 16)}-${safeName}`].join('/');
  }
}

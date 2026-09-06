import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttachmentKind, StorageBackend, StoredFile } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { ImageOptimizerService } from '../../common/images/image-optimizer.service';
import {
  ImagePurpose,
  MAX_UPLOAD_BYTES,
  formatBytes,
  isAcceptedDocument,
  isAcceptedImage,
} from '@decor/shared';

export interface IncomingFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/**
 * Everything that turns an uploaded byte stream into a StoredFile row.
 *
 * The order matters: validate, then optimise, then encrypt-and-store. Optimising
 * before storage is what keeps a 12 MP site photo from becoming a 12 MP row, and
 * doing it here rather than trusting the client means it happens even when the
 * upload came from curl.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly optimizer: ImageOptimizerService,
  ) {}

  async ingest(
    file: IncomingFile,
    kind: AttachmentKind,
    userId?: string,
  ): Promise<StoredFile> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file was received');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        `${file.originalname} is ${formatBytes(file.size)}, over the ${formatBytes(MAX_UPLOAD_BYTES)} upload limit`,
      );
    }

    const isPdf = isAcceptedDocument(file.mimetype);
    if (!isPdf && !isAcceptedImage(file.mimetype)) {
      throw new BadRequestException(
        `${file.originalname} is a ${file.mimetype}, which is not an accepted image or PDF`,
      );
    }

    if (isPdf) {
      // PDFs are stored as-is: re-encoding a drawing would be lossy, and the
      // point of attaching one is that it is the client's own document.
      const stored = await this.storage.put(file.buffer, {
        fileName: file.originalname,
        mimeType: file.mimetype,
      });
      return this.persist(stored, {
        fileName: file.originalname,
        mimeType: file.mimetype,
        originalByteSize: file.size,
        userId,
      });
    }

    const purpose: ImagePurpose =
      kind === AttachmentKind.SIZE_IMAGE ? 'SIZE_IMAGE' : 'REFERENCE_IMAGE';
    const optimized = await this.optimizer.optimize(file.buffer, purpose, file.mimetype);

    const stored = await this.storage.put(optimized.data, {
      fileName: replaceExtension(file.originalname, 'webp'),
      mimeType: optimized.mimeType,
    });

    return this.persist(stored, {
      fileName: replaceExtension(file.originalname, 'webp'),
      mimeType: optimized.mimeType,
      originalByteSize: optimized.originalByteSize,
      width: optimized.width,
      height: optimized.height,
      userId,
    });
  }

  async read(id: string): Promise<{ file: StoredFile; data: Buffer }> {
    const file = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException(`File ${id} not found`);
    const data = await this.storage.read(file);
    return { file, data };
  }

  private async persist(
    stored: {
      backend: StorageBackend;
      bucket?: string;
      objectKey?: string;
      data?: Buffer;
      byteSize: number;
      checksum: string;
      isEncrypted: boolean;
      encryptionKeyId?: string;
    },
    meta: {
      fileName: string;
      mimeType: string;
      originalByteSize: number;
      width?: number;
      height?: number;
      userId?: string;
    },
  ): Promise<StoredFile> {
    return this.prisma.storedFile.create({
      data: {
        backend: stored.backend,
        bucket: stored.bucket,
        objectKey: stored.objectKey,
        data: stored.data ? new Uint8Array(stored.data) : undefined,
        fileName: meta.fileName,
        mimeType: meta.mimeType,
        byteSize: stored.byteSize,
        originalByteSize: meta.originalByteSize,
        width: meta.width,
        height: meta.height,
        checksum: stored.checksum,
        isEncrypted: stored.isEncrypted,
        encryptionKeyId: stored.encryptionKeyId,
        uploadedById: meta.userId,
      },
    });
  }
}

function replaceExtension(fileName: string, extension: string): string {
  return `${fileName.replace(/\.[^.]+$/, '')}.${extension}`;
}

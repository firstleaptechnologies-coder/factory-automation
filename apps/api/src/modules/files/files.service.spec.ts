import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttachmentKind, StorageBackend } from '@prisma/client';
import { MAX_UPLOAD_BYTES } from '@fas/shared';
import { FilesService } from './files.service';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build() {
  const db = prismaMock() as never as Db;
  const storage = {
    put: jest.fn(async (..._args: unknown[]) => ({
      backend: StorageBackend.DATABASE,
      data: Buffer.from('cipher'),
      byteSize: 6,
      checksum: 'abc',
      isEncrypted: true,
      encryptionKeyId: 'k1',
    })),
    read: jest.fn(async () => Buffer.from('plain')),
  };
  const optimizer = {
    optimize: jest.fn(async (..._args: unknown[]) => ({
      data: Buffer.from('webp'),
      mimeType: 'image/webp',
      width: 1024,
      height: 768,
      byteSize: 4,
      originalByteSize: 900000,
    })),
  };
  return {
    service: new FilesService(db as never, storage as never, optimizer as never),
    db,
    storage,
    optimizer,
  };
}

const upload = (over: Record<string, unknown> = {}) =>
  ({
    buffer: Buffer.from('bytes'),
    originalname: 'site photo.JPG',
    mimetype: 'image/jpeg',
    size: 5,
    ...over,
  }) as never;

describe('ingest — what it refuses', () => {
  it('refuses an empty upload', async () => {
    const { service } = build();
    await expect(
      service.ingest(upload({ buffer: Buffer.alloc(0) }), AttachmentKind.REFERENCE_IMAGE),
    ).rejects.toThrow(/No file was received/);
  });

  it('refuses a missing file object', async () => {
    const { service } = build();
    await expect(
      service.ingest(undefined as never, AttachmentKind.REFERENCE_IMAGE),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('names the file and both sizes when it is over the limit', async () => {
    const { service } = build();
    await expect(
      service.ingest(upload({ size: MAX_UPLOAD_BYTES + 1 }), AttachmentKind.REFERENCE_IMAGE),
    ).rejects.toThrow(/site photo\.JPG is .* over the .* upload limit/);
  });

  it('refuses a type that is neither an image nor a PDF, and says what it was', async () => {
    const { service } = build();
    await expect(
      service.ingest(
        upload({ mimetype: 'application/zip' }),
        AttachmentKind.REFERENCE_IMAGE,
      ),
    ).rejects.toThrow(/is a application\/zip/);
  });
});

describe('ingest — images', () => {
  it('re-encodes on the server even though the client already did', async () => {
    const { service, optimizer } = build();
    await inTenant(() => service.ingest(upload(), AttachmentKind.REFERENCE_IMAGE));
    // The client can be bypassed — curl uploads reach the same code.
    expect(optimizer.optimize).toHaveBeenCalled();
  });

  it('optimises a size image under its own budget', async () => {
    const { service, optimizer } = build();
    await inTenant(() => service.ingest(upload(), AttachmentKind.SIZE_IMAGE));
    expect(optimizer.optimize.mock.calls[0][1]).toBe('SIZE_IMAGE');
  });

  it('treats every other kind as a reference image', async () => {
    const { service, optimizer } = build();
    await inTenant(() => service.ingest(upload(), AttachmentKind.DOCUMENT));
    expect(optimizer.optimize.mock.calls[0][1]).toBe('REFERENCE_IMAGE');
  });

  it('renames the stored file to .webp, since that is what it now is', async () => {
    const { service, db } = build();
    await inTenant(() => service.ingest(upload(), AttachmentKind.REFERENCE_IMAGE));
    expect(db.storedFile.create.mock.calls[0][0].data.fileName).toBe('site photo.webp');
  });

  it('records the size before optimisation, so the saving is visible', async () => {
    const { service, db } = build();
    await inTenant(() => service.ingest(upload(), AttachmentKind.REFERENCE_IMAGE));
    const data = db.storedFile.create.mock.calls[0][0].data;
    expect(data.originalByteSize).toBe(900000);
    expect(data.byteSize).toBe(6);
  });

  it('stores the dimensions', async () => {
    const { service, db } = build();
    await inTenant(() => service.ingest(upload(), AttachmentKind.REFERENCE_IMAGE));
    expect(db.storedFile.create.mock.calls[0][0].data).toMatchObject({
      width: 1024,
      height: 768,
    });
  });

  it('carries the encryption key id onto the row', async () => {
    const { service, db } = build();
    await inTenant(() => service.ingest(upload(), AttachmentKind.REFERENCE_IMAGE));
    expect(db.storedFile.create.mock.calls[0][0].data).toMatchObject({
      isEncrypted: true,
      encryptionKeyId: 'k1',
      checksum: 'abc',
      tenantId: 'tenant-test',
    });
  });
});

describe('ingest — PDFs', () => {
  const pdf = () =>
    upload({ mimetype: 'application/pdf', originalname: 'drawing.pdf', size: 1000 });

  it('stores a PDF byte for byte', async () => {
    const { service, optimizer, storage } = build();
    await inTenant(() => service.ingest(pdf(), AttachmentKind.DOCUMENT));
    // Re-encoding a drawing would be lossy, and the point of attaching one is
    // that it is the client's own document.
    expect(optimizer.optimize).not.toHaveBeenCalled();
    expect(storage.put.mock.calls[0][1]).toMatchObject({
      fileName: 'drawing.pdf',
      mimeType: 'application/pdf',
    });
  });

  it('keeps the PDF name and type on the row', async () => {
    const { service, db } = build();
    await inTenant(() => service.ingest(pdf(), AttachmentKind.DOCUMENT));
    expect(db.storedFile.create.mock.calls[0][0].data).toMatchObject({
      fileName: 'drawing.pdf',
      mimeType: 'application/pdf',
      originalByteSize: 1000,
    });
  });
});

describe('read', () => {
  it('reports a missing file', async () => {
    const { service } = build();
    await expect(service.read('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the row alongside the decrypted bytes', async () => {
    const { service, db, storage } = build();
    db.storedFile.findUnique = jest.fn(async () => ({ id: 'f1', fileName: 'a.webp' }));
    const result = await service.read('f1');
    expect(result.file).toMatchObject({ id: 'f1' });
    expect(result.data.toString()).toBe('plain');
    expect(storage.read).toHaveBeenCalled();
  });
});

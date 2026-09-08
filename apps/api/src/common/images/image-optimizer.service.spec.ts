import sharp from 'sharp';
import { BadRequestException, Logger } from '@nestjs/common';
import { ImageOptimizerService } from './image-optimizer.service';

const service = new ImageOptimizerService();

/** A plain image of a given size, in whatever format is asked for. */
const image = async (
  width: number,
  height: number,
  format: 'jpeg' | 'png' = 'jpeg',
): Promise<Buffer> =>
  sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } },
  })
    [format]()
    .toBuffer();

/** A portrait photo written as landscape pixels plus an EXIF rotation, the way a phone does. */
const rotatedPhoto = async (): Promise<Buffer> =>
  sharp({ create: { width: 400, height: 200, channels: 3, background: { r: 10, g: 90, b: 200 } } })
    .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'Decor Bucket' } } })
    .jpeg()
    .toBuffer();

beforeAll(() => {
  Logger.overrideLogger(false);
});

describe('what it will accept', () => {
  it('refuses a type that is not an image at all', async () => {
    await expect(
      service.optimize(Buffer.from('not an image'), 'REFERENCE_IMAGE', 'application/pdf'),
    ).rejects.toThrow('Unsupported image type "application/pdf"');
  });

  it('refuses a file that claims to be an image and is not', async () => {
    await expect(
      service.optimize(Buffer.from('not an image'), 'REFERENCE_IMAGE', 'image/jpeg'),
    ).rejects.toThrow(BadRequestException);
  });

  it('takes what a phone camera actually produces', async () => {
    const result = await service.optimize(await image(100, 100, 'png'), 'REFERENCE_IMAGE', 'image/png');
    expect(result.mimeType).toBe('image/webp');
  });
});

describe('re-encoding', () => {
  it('normalises everything to one format every browser can render', async () => {
    const result = await service.optimize(await image(50, 50), 'REFERENCE_IMAGE', 'image/jpeg');
    // A client can be bypassed, so what arrived is re-encoded regardless.
    expect(result.mimeType).toBe('image/webp');
    expect((await sharp(result.data).metadata()).format).toBe('webp');
  });

  it('reports both sizes, so the saving is visible', async () => {
    const input = await image(1200, 900);
    const result = await service.optimize(input, 'REFERENCE_IMAGE', 'image/jpeg');
    expect(result.originalByteSize).toBe(input.byteLength);
    expect(result.byteSize).toBe(result.data.byteLength);
  });

  it('reports the size the picture actually ended up', async () => {
    const result = await service.optimize(await image(300, 200), 'REFERENCE_IMAGE', 'image/jpeg');
    expect([result.width, result.height]).toEqual([300, 200]);
  });
});

describe('size limits', () => {
  it('brings a picture down to the long edge its purpose allows', async () => {
    const result = await service.optimize(await image(4000, 2000), 'REFERENCE_IMAGE', 'image/jpeg');
    expect(result.width).toBe(2048);
    expect(result.height).toBe(1024);
  });

  it('keeps more resolution for a picture somebody will read a number off', async () => {
    const result = await service.optimize(await image(4000, 2000), 'SIZE_IMAGE', 'image/jpeg');
    // A tape on a wall gets pinch-zoomed; a mood shot does not.
    expect(result.width).toBe(3000);
  });

  it('never enlarges a small picture to fill the budget', async () => {
    const result = await service.optimize(await image(120, 80), 'REFERENCE_IMAGE', 'image/jpeg');
    expect([result.width, result.height]).toEqual([120, 80]);
  });
});

describe('what travels with the picture', () => {
  it('strips the EXIF a phone attaches', async () => {
    const result = await service.optimize(await rotatedPhoto(), 'REFERENCE_IMAGE', 'image/jpeg');
    const metadata = await sharp(result.data).metadata();
    // Site photos carry GPS and a device id; a client's address should not
    // travel with a reference picture.
    expect(metadata.exif).toBeUndefined();
  });

  it('turns the picture the right way up before the metadata goes', async () => {
    const result = await service.optimize(await rotatedPhoto(), 'REFERENCE_IMAGE', 'image/jpeg');
    // Drop EXIF without rotating first and every portrait photo lands on its
    // side, with nothing left to say which way is up.
    expect(result.width).toBe(200);
    expect(result.height).toBe(400);
  });

  it('keeps a portrait photo at full resolution', async () => {
    const result = await service.optimize(await rotatedPhoto(), 'SIZE_IMAGE', 'image/jpeg');
    // Measured against the stored landscape dimensions, the fit box arrives
    // transposed and halves the picture.
    expect([result.width, result.height]).toEqual([200, 400]);
  });

  it('still brings an oversized portrait photo down to the long edge', async () => {
    const tall = await sharp({
      create: { width: 5000, height: 2000, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const result = await service.optimize(tall, 'REFERENCE_IMAGE', 'image/jpeg');
    // Rounded to whole pixels, so the long edge lands on the limit or just under.
    expect(Math.max(result.width, result.height)).toBeGreaterThan(2040);
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(2048);
    expect(result.height).toBeGreaterThan(result.width);
  });
});

describe('thumbnails', () => {
  it('makes a small preview for lists and the punch strip', async () => {
    const result = await service.thumbnail(await image(2000, 1000));
    expect(result.width).toBeLessThanOrEqual(400);
    expect(result.mimeType).toBe('image/webp');
  });

  it('turns a sideways photo up the right way too', async () => {
    const result = await service.thumbnail(await rotatedPhoto());
    expect(result.height).toBeGreaterThan(result.width);
  });

  it('leaves a picture smaller than a thumbnail alone', async () => {
    const result = await service.thumbnail(await image(80, 60));
    expect([result.width, result.height]).toEqual([80, 60]);
  });
});

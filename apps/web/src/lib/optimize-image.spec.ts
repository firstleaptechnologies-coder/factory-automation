import { optimizeImage } from './optimize-image';

function fileOf(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

interface Harness {
  drawn: { width: number; height: number }[];
  encoded: { type: string; quality: number }[];
  blobSize: number;
  bitmapClosed: boolean;
}

let harness: Harness;

function install(bitmap: { width: number; height: number } | null) {
  harness = { drawn: [], encoded: [], blobSize: 100, bitmapClosed: false };

  (globalThis as Record<string, unknown>).createImageBitmap = jest.fn(async () => {
    if (!bitmap) throw new Error('cannot decode');
    return {
      ...bitmap,
      close: () => {
        harness.bitmapClosed = true;
      },
    };
  });

  jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag !== 'canvas') {
      return Object.create(HTMLElement.prototype) as HTMLElement;
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (_image: unknown, _x: number, _y: number, width: number, height: number) => {
          harness.drawn.push({ width, height });
        },
      }),
      toBlob: (callback: (blob: Blob | null) => void, type: string, quality: number) => {
        harness.encoded.push({ type, quality });
        const blob = new Blob(['x']);
        Object.defineProperty(blob, 'size', { value: harness.blobSize });
        callback(harness.blobSize < 0 ? null : blob);
      },
    };
    return canvas as unknown as HTMLElement;
  });
}

afterEach(() => jest.restoreAllMocks());

it('leaves a PDF alone', async () => {
  install({ width: 100, height: 100 });
  const file = fileOf('drawing.pdf', 'application/pdf', 5_000_000);
  await expect(optimizeImage(file, 'REFERENCE_IMAGE')).resolves.toBe(file);
});

it('leaves HEIC to the server, which has libvips', async () => {
  install({ width: 100, height: 100 });
  const file = fileOf('IMG_0001.HEIC', 'image/heic', 5_000_000);
  // Canvas cannot decode it in most browsers.
  await expect(optimizeImage(file, 'REFERENCE_IMAGE')).resolves.toBe(file);
});

it('hands over an undecodable image rather than blocking the upload', async () => {
  install(null);
  const file = fileOf('broken.jpg', 'image/jpeg', 5_000_000);
  await expect(optimizeImage(file, 'REFERENCE_IMAGE')).resolves.toBe(file);
});

it('re-encodes a phone photo to webp and renames it', async () => {
  install({ width: 4000, height: 3000 });
  const result = await optimizeImage(fileOf('IMG_9.jpg', 'image/jpeg', 12_000_000), 'REFERENCE_IMAGE');
  expect(result.type).toBe('image/webp');
  expect(result.name).toBe('IMG_9.webp');
  expect(harness.encoded[0].type).toBe('image/webp');
});

it('scales the long edge down, keeping the aspect ratio', async () => {
  install({ width: 4000, height: 3000 });
  await optimizeImage(fileOf('a.jpg', 'image/jpeg', 12_000_000), 'REFERENCE_IMAGE');
  const { width, height } = harness.drawn[0];
  expect(width / height).toBeCloseTo(4 / 3, 3);
  expect(Math.max(width, height)).toBeLessThan(4000);
});

it('does not enlarge an already-small image', async () => {
  install({ width: 320, height: 240 });
  await optimizeImage(fileOf('a.jpg', 'image/jpeg', 40_000), 'REFERENCE_IMAGE');
  expect(harness.drawn[0]).toEqual({ width: 320, height: 240 });
});

it('sends quality as a 0-1 fraction, which is what canvas expects', async () => {
  install({ width: 1000, height: 1000 });
  await optimizeImage(fileOf('a.jpg', 'image/jpeg', 900_000), 'REFERENCE_IMAGE');
  expect(harness.encoded[0].quality).toBeGreaterThan(0);
  expect(harness.encoded[0].quality).toBeLessThanOrEqual(1);
});

it('keeps the original when the "optimised" version came out bigger', async () => {
  install({ width: 200, height: 200 });
  const file = fileOf('tiny.png', 'image/png', 500);
  harness.blobSize = 900;
  await expect(optimizeImage(file, 'REFERENCE_IMAGE')).resolves.toBe(file);
});

it('keeps the original when the browser produced no blob', async () => {
  install({ width: 1000, height: 1000 });
  const file = fileOf('a.jpg', 'image/jpeg', 900_000);
  harness.blobSize = -1;
  await expect(optimizeImage(file, 'REFERENCE_IMAGE')).resolves.toBe(file);
});

it('releases the decoded bitmap', async () => {
  install({ width: 1000, height: 1000 });
  await optimizeImage(fileOf('a.jpg', 'image/jpeg', 900_000), 'REFERENCE_IMAGE');
  expect(harness.bitmapClosed).toBe(true);
});

it('uses the tighter budget for a size photo than a reference photo', async () => {
  install({ width: 6000, height: 6000 });
  await optimizeImage(fileOf('a.jpg', 'image/jpeg', 9_000_000), 'SIZE_IMAGE');
  const size = harness.drawn[0].width;
  install({ width: 6000, height: 6000 });
  await optimizeImage(fileOf('a.jpg', 'image/jpeg', 9_000_000), 'REFERENCE_IMAGE');
  const reference = harness.drawn[0].width;
  // A size photo is a note about a measurement, not a picture of the job.
  expect(size).not.toBe(reference);
});

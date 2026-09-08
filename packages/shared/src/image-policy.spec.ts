import {
  ACCEPTED_IMAGE_TYPES,
  IMAGE_TARGETS,
  fitWithin,
  formatBytes,
  isAcceptedDocument,
  isAcceptedImage,
} from './image-policy';

describe('accepted uploads', () => {
  it('takes the formats a phone camera produces', () => {
    for (const type of ACCEPTED_IMAGE_TYPES) {
      expect(isAcceptedImage(type)).toBe(true);
    }
    expect(isAcceptedImage('image/heic')).toBe(true);
  });

  it('rejects anything that is not an image we handle', () => {
    for (const type of ['image/svg+xml', 'text/html', 'application/zip', '']) {
      expect(isAcceptedImage(type)).toBe(false);
    }
  });

  it('takes a PDF as a document but not as an image', () => {
    expect(isAcceptedDocument('application/pdf')).toBe(true);
    expect(isAcceptedImage('application/pdf')).toBe(false);
  });
});

describe('fitWithin', () => {
  it('scales the longest edge down and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 });
  });

  it('never upscales a photo that is already small', () => {
    // Enlarging invents detail and makes the file bigger for nothing.
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });

  it('leaves an image exactly at the limit alone', () => {
    expect(fitWithin(2048, 1000, 2048)).toEqual({ width: 2048, height: 1000 });
  });
});

describe('image targets', () => {
  it('keeps size images sharper than reference shots', () => {
    // Somebody pinch-zooms a size image to read a number off it; a reference
    // shot is only ever looked at.
    expect(IMAGE_TARGETS.SIZE_IMAGE.maxEdge).toBeGreaterThan(
      IMAGE_TARGETS.REFERENCE_IMAGE.maxEdge,
    );
    expect(IMAGE_TARGETS.SIZE_IMAGE.quality).toBeGreaterThan(
      IMAGE_TARGETS.REFERENCE_IMAGE.quality,
    );
  });

  it('makes thumbnails the smallest of the three', () => {
    expect(IMAGE_TARGETS.THUMBNAIL.maxEdge).toBeLessThan(
      IMAGE_TARGETS.REFERENCE_IMAGE.maxEdge,
    );
  });
});

describe('formatBytes', () => {
  it('reads the way a person would say it', () => {
    expect(formatBytes(0)).toMatch(/0/);
    expect(formatBytes(512)).toMatch(/B/);
    expect(formatBytes(1024 * 1024)).toMatch(/MB/);
  });
});

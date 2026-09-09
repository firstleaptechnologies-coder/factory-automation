'use client';

import { IMAGE_TARGETS, ImagePurpose, fitWithin } from '@fas/shared';

/**
 * Client-side image optimisation, run before anything is uploaded.
 *
 * The server optimises again and is the authority, but that only helps after
 * the bytes have already crossed the network. A phone photo taken in a client's
 * flat is 10-15 MB; on shop wifi that is the difference between an upload that
 * feels instant and one the person gives up on. So the browser resizes and
 * re-encodes first, and the server's pass becomes a cheap no-op.
 *
 * Canvas re-encoding also drops EXIF as a side effect, so GPS coordinates from
 * a site visit never leave the device.
 */
export async function optimizeImage(file: File, purpose: ImagePurpose): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  // HEIC cannot be decoded by canvas in most browsers. Send it untouched and
  // let the server (which has libvips) handle it.
  if (/heic|heif/i.test(file.type)) return file;

  const target = IMAGE_TARGETS[purpose];

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Unreadable here for any reason — hand the original over rather than
    // blocking the upload; the server will judge it.
    return file;
  }

  const { width, height } = fitWithin(bitmap.width, bitmap.height, target.maxEdge);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', target.quality / 100),
  );

  // If the "optimised" version is somehow larger, keep the original.
  if (!blob || blob.size >= file.size) return file;

  return new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
    type: 'image/webp',
    lastModified: Date.now(),
  });
}

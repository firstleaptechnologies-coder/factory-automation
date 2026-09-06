/**
 * Image optimisation policy, shared by every client and the server.
 *
 * The rule is: an image is optimised *before* it is uploaded, so a 12 MP phone
 * photo taken on site never crosses the shop's network at full size. The server
 * then re-optimises whatever arrives, because a client can be bypassed and a
 * policy that is only enforced on the client is not enforced at all.
 *
 * Both sides read these numbers, so "what counts as optimised" is defined once.
 */

export type ImagePurpose = 'REFERENCE_IMAGE' | 'SIZE_IMAGE' | 'THUMBNAIL';

export interface ImageTarget {
  /** Longest edge, px. Images smaller than this are never upscaled. */
  maxEdge: number;
  /** Encoder quality, 1-100. */
  quality: number;
  /** Reject anything above this after optimisation. */
  maxBytes: number;
}

export const IMAGE_TARGETS: Record<ImagePurpose, ImageTarget> = {
  /** Mood/reference shots: viewed, never measured from. */
  REFERENCE_IMAGE: { maxEdge: 2048, quality: 80, maxBytes: 2 * 1024 * 1024 },
  /**
   * Size images are pictures of dimensions — a scribbled drawing or a tape on a
   * wall. Someone will pinch-zoom to read a number off one, so they keep more
   * resolution and quality than a reference shot.
   */
  SIZE_IMAGE: { maxEdge: 3000, quality: 90, maxBytes: 5 * 1024 * 1024 },
  THUMBNAIL: { maxEdge: 400, quality: 70, maxBytes: 200 * 1024 },
};

/** Formats we accept on upload. Anything else is rejected before it is stored. */
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export const ACCEPTED_DOCUMENT_TYPES = ['application/pdf'] as const;

/** Hard ceiling on what may be sent at all, before optimisation. */
export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

export function isAcceptedImage(mimeType: string): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(mimeType.toLowerCase());
}

export function isAcceptedDocument(mimeType: string): boolean {
  return (ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(mimeType.toLowerCase());
}

/** Scale to fit inside `maxEdge` without upscaling or changing aspect ratio. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(Math.round(width * scale), 1),
    height: Math.max(Math.round(height * scale), 1),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

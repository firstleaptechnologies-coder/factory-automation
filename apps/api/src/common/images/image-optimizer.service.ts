import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import sharp, { type Metadata, type OutputInfo } from 'sharp';
import {
  IMAGE_TARGETS,
  ImagePurpose,
  fitWithin,
  formatBytes,
  isAcceptedImage,
} from '@fas/shared';

export interface OptimizedImage {
  data: Buffer;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  originalByteSize: number;
}

/**
 * Server-side image optimisation — the authoritative pass.
 *
 * Clients optimise before uploading so big photos never cross the shop's
 * network, but a client can be bypassed, so everything is re-encoded here
 * regardless of what arrived. That also normalises the zoo of formats a phone
 * camera produces (HEIC especially) into something every browser can render.
 *
 * Two details that matter beyond file size:
 *
 *  - EXIF is stripped. Site photos from a phone carry GPS coordinates and a
 *    device id; a client's home address should not travel with a reference
 *    picture.
 *  - Orientation is baked in before the metadata goes. Drop EXIF without
 *    rotating first and every portrait photo lands on its side.
 */
@Injectable()
export class ImageOptimizerService {
  private readonly logger = new Logger(ImageOptimizerService.name);

  async optimize(
    input: Buffer,
    purpose: ImagePurpose,
    mimeType: string,
  ): Promise<OptimizedImage> {
    if (!isAcceptedImage(mimeType)) {
      throw new BadRequestException(`Unsupported image type "${mimeType}"`);
    }

    const target = IMAGE_TARGETS[purpose];
    const originalByteSize = input.byteLength;

    let metadata: Metadata;
    try {
      metadata = await sharp(input).metadata();
    } catch {
      throw new BadRequestException('That file is not a readable image');
    }

    if (!metadata.width || !metadata.height) {
      throw new BadRequestException('Could not read the image dimensions');
    }

    const output = await this.encodeToFit(input, metadata, target);

    this.logger.debug(
      `Optimised ${purpose}: ${formatBytes(originalByteSize)} -> ${formatBytes(output.data.byteLength)}`,
    );

    return {
      data: output.data,
      mimeType: 'image/webp',
      width: output.info.width,
      height: output.info.height,
      byteSize: output.data.byteLength,
      originalByteSize,
    };
  }

  /**
   * Encode within the size budget, giving ground rather than giving up.
   *
   * A detailed photo can exceed the budget even at the target quality — noisy
   * textures like stone and wood grain are genuinely hard to compress. Refusing
   * the upload at that point punishes the user for our encoder settings, and
   * the person holding the phone on site has no way to act on the error. So
   * step quality down, then dimensions, and only fail if the image will not fit
   * even at the floor — which in practice means it was never a photo.
   */
  private async encodeToFit(
    input: Buffer,
    metadata: Metadata,
    target: { maxEdge: number; quality: number; maxBytes: number },
  ) {
    const qualitySteps = [target.quality, 75, 60, 45];
    const edgeSteps = [target.maxEdge, Math.round(target.maxEdge * 0.75), Math.round(target.maxEdge * 0.5)];

    /*
     * Measure the picture the way it will be seen.
     *
     * A phone writes a portrait photo as landscape pixels plus an EXIF
     * rotation. Fitting against the stored dimensions hands `resize` a
     * transposed box, and the rotated image is squeezed to fit inside it — a
     * 200×400 photo came out 100×200, half the resolution, on exactly the size
     * images somebody needs to read a number off.
     */
    const turned = (metadata.orientation ?? 1) >= 5;
    const sourceWidth = turned ? metadata.height! : metadata.width!;
    const sourceHeight = turned ? metadata.width! : metadata.height!;

    let last!: { data: Buffer; info: OutputInfo };

    for (const maxEdge of edgeSteps) {
      const { width, height } = fitWithin(sourceWidth, sourceHeight, maxEdge);

      for (const quality of qualitySteps) {
        const attempt = await sharp(input)
          // Apply the EXIF rotation to the pixels, so stripping metadata next
          // does not leave the image sideways.
          .rotate()
          .resize(width, height, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality })
          .toBuffer({ resolveWithObject: true });

        if (attempt.data.byteLength <= target.maxBytes) {
          if (quality !== target.quality || maxEdge !== target.maxEdge) {
            this.logger.debug(
              `Image needed extra compression to fit: quality ${quality}, max edge ${maxEdge}px`,
            );
          }
          return attempt;
        }
        last = attempt;
      }
    }

    throw new BadRequestException(
      `This image is ${formatBytes(last.data.byteLength)} even after maximum compression, ` +
        `over the ${formatBytes(target.maxBytes)} limit. It may not be a photograph.`,
    );
  }

  /** Small preview for lists and the punch form's thumbnail strip. */
  async thumbnail(input: Buffer): Promise<OptimizedImage> {
    const target = IMAGE_TARGETS.THUMBNAIL;
    const output = await sharp(input)
      .rotate()
      .resize(target.maxEdge, target.maxEdge, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: target.quality })
      .toBuffer({ resolveWithObject: true });

    return {
      data: output.data,
      mimeType: 'image/webp',
      width: output.info.width,
      height: output.info.height,
      byteSize: output.data.byteLength,
      originalByteSize: input.byteLength,
    };
  }
}

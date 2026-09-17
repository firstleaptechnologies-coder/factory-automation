import { Injectable, NotFoundException } from '@nestjs/common';
import { OtaPlatform, OtaReleaseKind, OtaReleaseStatus, StorageBackend } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import {
  ManifestAsset,
  buildManifest,
  parseRolloutBucket,
  buildMultipartResponse,
  deterministicBucket,
  isInRollout,
  noUpdateAvailableDirective,
  rollBackToEmbeddedDirective,
  type MultipartResponse,
} from '../../common/ota/manifest';
import { assetHash, assetKey } from '../../common/ota/signing';

/** What the client tells us about itself on every check. */
export interface UpdateRequest {
  platform?: string;
  runtimeVersion?: string;
  channel?: string;
  /** The install's sticky rollout bucket, as a structured-field string. */
  extraParams?: string | null;
  /** The update it is already running, so we can say "nothing newer". */
  currentUpdateId?: string | null;
  /** Where assets should be fetched from, which is wherever this API is. */
  baseUrl: string;
}

/**
 * What the app should be running.
 *
 * Self-hosted Expo Updates. The app asks on launch, gets a manifest or a
 * directive, and swaps the new bundle in next time it starts. Which means the
 * work in every phase after this reaches the floor the day it is written
 * instead of waiting on a store review — the reason this is built early.
 */
@Injectable()
export class OtaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async manifest(request: UpdateRequest): Promise<MultipartResponse> {
    const platform = asPlatform(request.platform);
    if (!platform || !request.runtimeVersion) {
      // The client did not identify itself well enough to be given code.
      return this.directive(noUpdateAvailableDirective());
    }

    const channel = request.channel || 'production';
    const release = await this.prisma.platform.otaRelease.findFirst({
      where: {
        channel,
        platform,
        runtimeVersion: request.runtimeVersion,
        status: OtaReleaseStatus.PUBLISHED,
      },
      orderBy: { createdAt: 'desc' },
      include: { assets: true },
    });

    if (!release) return this.directive(noUpdateAvailableDirective());

    /*
     * The staged rollout, decided from the install's own bucket.
     *
     * A device outside the rollout is told there is nothing new rather than
     * being refused — from its point of view those are the same thing, and one
     * of them is not an error.
     */
    const bucket =
      parseRolloutBucket(request.extraParams ?? null) ??
      deterministicBucket(`${release.id}:${request.currentUpdateId ?? 'unknown'}`);
    if (!isInRollout(bucket, release.rolloutPercent)) {
      return this.directive(noUpdateAvailableDirective());
    }

    if (release.kind === OtaReleaseKind.ROLLBACK) {
      return this.directive(
        rollBackToEmbeddedDirective((release.commitTime ?? release.createdAt).toISOString()),
      );
    }

    // Already running it: say so rather than sending the same bundle again.
    if (request.currentUpdateId && request.currentUpdateId === release.id) {
      return this.directive(noUpdateAvailableDirective());
    }

    const launch = release.assets.find((asset) => asset.isLaunchAsset);
    if (!launch) {
      // A release with no bundle is a mistake in publishing, not something to
      // hand to a phone.
      return this.directive(noUpdateAvailableDirective());
    }

    const manifest = buildManifest({
      id: release.id,
      createdAt: release.createdAt,
      runtimeVersion: release.runtimeVersion,
      sequence: release.sequence,
      metadata: release.metadata,
      extra: release.extra,
      launchAsset: describeAsset(launch, request.baseUrl),
      assets: release.assets
        .filter((asset) => !asset.isLaunchAsset)
        .map((asset) => describeAsset(asset, request.baseUrl)),
    });

    return buildMultipartResponse([
      { name: 'manifest', body: JSON.stringify(manifest), sign: true },
    ]);
  }

  /** The bytes of one asset, whichever backend is holding them. */
  async asset(id: string): Promise<{ body: Buffer; contentType: string }> {
    const asset = await this.prisma.platform.otaReleaseAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('No such asset');

    return {
      body: await this.storage.read({
        backend: asset.backend,
        bucket: asset.bucket,
        objectKey: asset.objectKey,
        data: asset.data,
        isEncrypted: asset.isEncrypted,
      }),
      contentType: asset.contentType,
    };
  }

  /**
   * Whether this binary is still allowed to run.
   *
   * Some changes cannot be delivered over the air, and an old binary meeting
   * an API that has moved on fails in ways nobody can explain over the phone.
   */
  async versionCheck(platformName?: string, channel = 'production', build?: number) {
    const platform = asPlatform(platformName);
    if (!platform) return { supported: true, updateAvailable: false, forced: false };

    const gate = await this.prisma.platform.appVersionGate.findUnique({
      where: { platform_channel: { platform, channel } },
    });
    // No gate is not the same as a gate that says no. A channel nobody has
    // configured must not stop an app that is working perfectly well.
    if (!gate) return { supported: true, updateAvailable: false, forced: false };

    // An app that did not say which build it is cannot be judged, only
    // informed. Older binaries predate this parameter, and refusing to run
    // them over a missing query string would be the update prompt from hell.
    const running = Number.isFinite(build) ? (build as number) : null;
    const forced = running !== null && running < gate.minSupportedBuild;

    // Only offer what the store is actually serving. A build that is uploaded
    // but still in review exists for us and not for the shop, and telling them
    // to install it leaves them tapping a button that does nothing.
    const updateAvailable =
      gate.latestIsLive && running !== null && running < gate.latestBuild;

    return {
      supported: !forced,
      updateAvailable,
      forced,
      latestBuild: gate.latestBuild,
      latestVersionName: gate.latestVersionName,
      minSupportedBuild: gate.minSupportedBuild,
      storeUrl: gate.storeUrl,
      message: gate.message,
    };
  }

  /** Store one file against a release, hashed the two ways the client needs. */
  async addAsset(
    releaseId: string,
    file: { bytes: Buffer; fileName: string; contentType: string; isLaunchAsset?: boolean },
  ) {
    const stored = await this.storage.put(file.bytes, {
      fileName: file.fileName,
      mimeType: file.contentType,
      // Bundles are megabytes; the database is the fallback, not the intent.
      backend: StorageBackend.S3,
      keyPrefix: `ota/${releaseId}`,
    });

    return this.prisma.platform.otaReleaseAsset.create({
      data: {
        releaseId,
        isLaunchAsset: Boolean(file.isLaunchAsset),
        key: assetKey(file.bytes),
        hash: assetHash(file.bytes),
        contentType: file.contentType,
        fileExtension: extensionOf(file.fileName),
        backend: stored.backend,
        bucket: stored.bucket,
        objectKey: stored.objectKey,
        data: stored.data ? new Uint8Array(stored.data) : undefined,
        byteSize: stored.byteSize,
        checksum: stored.checksum,
        isEncrypted: stored.isEncrypted,
        encryptionKeyId: stored.encryptionKeyId,
      },
    });
  }

  private directive(body: string): MultipartResponse {
    return buildMultipartResponse([{ name: 'directive', body, sign: true }]);
  }
}

function describeAsset(
  asset: { id: string; key: string; hash: string; contentType: string; fileExtension: string },
  baseUrl: string,
): ManifestAsset {
  return {
    key: asset.key,
    hash: asset.hash,
    contentType: asset.contentType,
    fileExtension: asset.fileExtension,
    // Served from this API, so a release needs no second host to exist.
    url: `${baseUrl.replace(/\/$/, '')}/api/updates/assets/${asset.id}`,
  };
}

function asPlatform(value?: string): OtaPlatform | null {
  if (value === 'ios') return OtaPlatform.ios;
  if (value === 'android') return OtaPlatform.android;
  return null;
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot) : '';
}

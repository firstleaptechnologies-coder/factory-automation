import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OtaPlatform, OtaReleaseKind, OtaReleaseStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { IncomingFile } from '../files/files.service';
import { OtaService } from './ota.service';
import { CreateReleaseDto, UpdateReleaseDto, VersionGateDto } from './dto/release.dto';

/** What a listed release says without its bytes. */
const SUMMARY = {
  id: true,
  channel: true,
  runtimeVersion: true,
  platform: true,
  kind: true,
  status: true,
  rolloutPercent: true,
  sequence: true,
  changelog: true,
  publishedBy: true,
  createdAt: true,
  activatedAt: true,
} as const;

/**
 * Putting a build in front of people, a few at a time.
 *
 * A release is uploaded as a draft, looked at, then published to a percentage
 * that can be walked up. The percentage is sticky per install, so raising it
 * only ever adds people — the alternative, deciding per launch, would have
 * devices updating and un-updating themselves.
 */
@Injectable()
export class ReleasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ota: OtaService,
  ) {}

  list(channel?: string, platform?: string) {
    return this.prisma.platform.otaRelease.findMany({
      where: {
        ...(channel ? { channel } : {}),
        ...(platform === 'ios' || platform === 'android'
          ? { platform: platform as OtaPlatform }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { ...SUMMARY, _count: { select: { assets: true } } },
    });
  }

  async create(dto: CreateReleaseDto) {
    /*
     * The next build number within this channel, platform and runtime version.
     *
     * Shown in the app beside the version, so somebody on the floor can say
     * which one they are on without reading a UUID over the phone.
     */
    const previous = await this.prisma.platform.otaRelease.findFirst({
      where: {
        channel: dto.channel,
        platform: dto.platform,
        runtimeVersion: dto.runtimeVersion,
      },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });

    return this.prisma.platform.otaRelease.create({
      data: {
        channel: dto.channel,
        runtimeVersion: dto.runtimeVersion,
        platform: dto.platform,
        kind: dto.kind ?? OtaReleaseKind.UPDATE,
        metadata: (dto.metadata ?? {}) as never,
        extra: (dto.extra ?? {}) as never,
        changelog: dto.changelog,
        sequence: (previous?.sequence ?? 0) + 1,
        // A rollback has nothing to download; it points at a moment instead.
        commitTime: dto.kind === OtaReleaseKind.ROLLBACK ? new Date() : null,
      },
      select: SUMMARY,
    });
  }

  async addAsset(releaseId: string, file: IncomingFile, isLaunchAsset: boolean) {
    const release = await this.prisma.platform.otaRelease.findUnique({
      where: { id: releaseId },
      include: { assets: { select: { id: true, isLaunchAsset: true } } },
    });
    if (!release) throw new NotFoundException('No such release');

    if (release.status !== OtaReleaseStatus.DRAFT) {
      // Changing what a published release contains would change what devices
      // already running it think they have.
      throw new BadRequestException('This release is already published — make a new one');
    }
    if (isLaunchAsset && release.assets.some((asset) => asset.isLaunchAsset)) {
      throw new BadRequestException('This release already has a bundle');
    }

    const asset = await this.ota.addAsset(releaseId, {
      bytes: file.buffer,
      fileName: file.originalname,
      contentType: file.mimetype || 'application/octet-stream',
      isLaunchAsset,
    });

    return { id: asset.id, key: asset.key, byteSize: asset.byteSize, isLaunchAsset };
  }

  async update(id: string, dto: UpdateReleaseDto, publishedBy?: string) {
    const release = await this.prisma.platform.otaRelease.findUnique({
      where: { id },
      include: { assets: { select: { isLaunchAsset: true } } },
    });
    if (!release) throw new NotFoundException('No such release');

    const publishing =
      dto.status === OtaReleaseStatus.PUBLISHED && release.status !== OtaReleaseStatus.PUBLISHED;

    if (
      publishing &&
      release.kind === OtaReleaseKind.UPDATE &&
      !release.assets.some((asset) => asset.isLaunchAsset)
    ) {
      // A release with no bundle would answer every device with a manifest
      // pointing at nothing.
      throw new BadRequestException('This release has no bundle to serve');
    }

    return this.prisma.$transaction(async (tx) => {
      if (publishing) {
        /*
         * At most one live release per channel, platform and runtime version.
         *
         * The manifest serves the newest published one, so a second would not
         * be served at all — it would sit there looking live while nobody ran
         * it. Retiring the previous one says what actually happened.
         */
        await tx.otaRelease.updateMany({
          where: {
            channel: release.channel,
            platform: release.platform,
            runtimeVersion: release.runtimeVersion,
            status: OtaReleaseStatus.PUBLISHED,
            id: { not: id },
          },
          data: { status: OtaReleaseStatus.ARCHIVED },
        });
      }

      return tx.otaRelease.update({
        where: { id },
        data: {
          status: dto.status,
          rolloutPercent: dto.rolloutPercent,
          changelog: dto.changelog,
          ...(publishing
            ? { activatedAt: release.activatedAt ?? new Date(), publishedBy }
            : {}),
        },
        select: SUMMARY,
      });
    });
  }

  /**
   * Go back to what was running before this release.
   *
   * Retires it, then re-publishes the most recent update it replaced, at 100%.
   * Full rollout on purpose: a rollback is not an experiment, it is an
   * admission — everybody should be off the bad bundle at once, not a fifth of
   * them at a time.
   *
   * When there is nothing to go back to, the release is retired and nothing
   * takes its place. The app then falls back to the bundle inside the binary,
   * which is the last thing known to work.
   */
  async rollback(id: string, byUserId?: string) {
    const release = await this.prisma.platform.otaRelease.findUnique({ where: { id } });
    if (!release) throw new NotFoundException('No such release');

    return this.prisma.platform.$transaction(async (tx) => {
      await tx.otaRelease.update({
        where: { id },
        data: { status: OtaReleaseStatus.ARCHIVED },
      });

      /*
       * The newest thing retired in this slot that was an ordinary update.
       *
       * Rollbacks are skipped: rolling back to a rollback says nothing about
       * which bundle anyone would end up running, and two of them in a row
       * would walk backwards through the history one release per press.
       */
      const previous = await tx.otaRelease.findFirst({
        where: {
          channel: release.channel,
          platform: release.platform,
          runtimeVersion: release.runtimeVersion,
          kind: OtaReleaseKind.UPDATE,
          status: OtaReleaseStatus.ARCHIVED,
          id: { not: id },
        },
        orderBy: { createdAt: 'desc' },
        select: SUMMARY,
      });

      if (!previous) return { rolledBackTo: null };

      const restored = await tx.otaRelease.update({
        where: { id: previous.id },
        data: {
          status: OtaReleaseStatus.PUBLISHED,
          rolloutPercent: 100,
          publishedBy: byUserId,
          activatedAt: previous.activatedAt ?? new Date(),
        },
        select: SUMMARY,
      });
      return { rolledBackTo: restored };
    });
  }

  gates() {
    return this.prisma.platform.appVersionGate.findMany({
      orderBy: [{ channel: 'asc' }, { platform: 'asc' }],
    });
  }

  /**
   * Write one gate.
   *
   * `latestIsLive` and `minSupportedBuild` are only touched when the caller
   * names them, which is what keeps CI and a person out of each other's way:
   * the release workflow records a new build without claiming the store is
   * serving it, and without quietly lowering a minimum somebody raised on
   * purpose.
   */
  setGate(dto: VersionGateDto, updatedBy?: string) {
    const stated = <T>(value: T | undefined) => (value === undefined ? {} : { value });
    const live = stated(dto.latestIsLive);
    const minimum = stated(dto.minSupportedBuild);

    return this.prisma.platform.appVersionGate.upsert({
      where: { platform_channel: { platform: dto.platform, channel: dto.channel } },
      create: {
        platform: dto.platform,
        channel: dto.channel,
        latestBuild: dto.latestBuild,
        latestVersionName: dto.latestVersionName ?? null,
        latestIsLive: dto.latestIsLive ?? false,
        liveConfirmedAt: dto.latestIsLive ? new Date() : null,
        minSupportedBuild: dto.minSupportedBuild ?? 0,
        storeUrl: dto.storeUrl,
        message: dto.message ?? null,
        updatedBy: updatedBy ?? null,
      },
      update: {
        latestBuild: dto.latestBuild,
        latestVersionName: dto.latestVersionName ?? null,
        storeUrl: dto.storeUrl,
        message: dto.message ?? null,
        updatedBy: updatedBy ?? null,
        ...('value' in live ? { latestIsLive: live.value } : {}),
        // Stamped only when it becomes live, so the date answers "since when"
        // rather than "when did anyone last touch this row".
        ...('value' in live && live.value ? { liveConfirmedAt: new Date() } : {}),
        ...('value' in live && live.value === false ? { liveConfirmedAt: null } : {}),
        ...('value' in minimum ? { minSupportedBuild: minimum.value } : {}),
      },
    });
  }
}

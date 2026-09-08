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

  async one(id: string) {
    const release = await this.prisma.platform.otaRelease.findUnique({
      where: { id },
      select: {
        ...SUMMARY,
        metadata: true,
        extra: true,
        commitTime: true,
        assets: {
          select: {
            id: true,
            isLaunchAsset: true,
            key: true,
            contentType: true,
            fileExtension: true,
            byteSize: true,
          },
        },
      },
    });
    if (!release) throw new NotFoundException('No such release');
    return release;
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

  gates() {
    return this.prisma.platform.appVersionGate.findMany({
      orderBy: [{ channel: 'asc' }, { platform: 'asc' }],
    });
  }

  setGate(dto: VersionGateDto) {
    return this.prisma.platform.appVersionGate.upsert({
      where: { platform_channel: { platform: dto.platform, channel: dto.channel } },
      create: dto,
      update: {
        minimumVersion: dto.minimumVersion,
        recommendedVersion: dto.recommendedVersion ?? null,
        message: dto.message ?? null,
      },
    });
  }
}

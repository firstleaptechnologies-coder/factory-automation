import { OtaPlatform, OtaReleaseKind, OtaReleaseStatus } from '@prisma/client';
import {
  IsBoolean,
  IsBooleanString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/** Channels are a small closed set; a typo here serves nobody an update. */
const CHANNEL = /^[a-z][a-z0-9-]{1,30}$/;

/**
 * Which releases, and how many of them.
 *
 * The list used to end at a hard `take: 100` with nothing saying so — the
 * hundred-and-first release simply did not exist to the screen, and a channel
 * that publishes daily reaches that inside four months. A page with a total
 * on it is the difference between "that is all of them" and "that is all we
 * showed you".
 */
export class ReleaseQueryDto extends PaginationDto {
  /**
   * Which channel's releases — `development` for TestFlight and Play
   * internal, `production` for the stores. Each deployment only holds its own,
   * so this is set from the API's own environment rather than picked.
   */
  @IsOptional() @IsString() channel?: string;
  /** iOS or Android. They are separate queues with their own live release. */
  @IsOptional() @IsString() platform?: string;
}

export class CreateReleaseDto {
  @Matches(CHANNEL, { message: 'A channel is lowercase letters, digits and dashes' })
  channel!: string;

  /** Must match the native build's runtime version exactly. */
  @IsString() @MaxLength(40) runtimeVersion!: string;

  /** iOS or Android. A bundle built for one is never served to the other. */
  @IsEnum(OtaPlatform) platform!: OtaPlatform;

  /**
   * An update, or a rollback. A rollback carries no bundle — it tells the app
   * to drop back to the one inside the binary — which is why it is a kind
   * rather than just another release.
   */
  @IsOptional() @IsEnum(OtaReleaseKind) kind?: OtaReleaseKind;
  /** What expo-updates is served alongside the bundle. */
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
  /**
   * Anything else worth carrying to the app — the OTA number it reads back on
   * its own settings screen, so somebody on a shop floor can say which bundle
   * they are on without reading a UUID down a phone.
   */
  @IsOptional() @IsObject() extra?: Record<string, unknown>;
  /** What changed. Written by the publish robot from the commit it built. */
  @IsOptional() @IsString() @MaxLength(2000) changelog?: string;
}

export class UpdateReleaseDto {
  /**
   * Draft, published, or archived. Publishing retires whatever was live in the
   * same channel, platform and runtime — there is only ever one — and
   * publishing something older than what is live is refused, because installs
   * will not go backwards and it would change nothing on any phone.
   */
  @IsOptional() @IsEnum(OtaReleaseStatus) status?: OtaReleaseStatus;

  /**
   * How many installs see it, 0–100.
   *
   * Sticky per install, so raising it only ever adds people — which is what
   * makes a staged rollout safe to walk up rather than a coin flip per launch.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) rolloutPercent?: number;

  /** What changed, if it is being corrected after the fact. */
  @IsOptional() @IsString() @MaxLength(2000) changelog?: string;
}

export class UploadAssetDto {
  /** The JS bundle. Exactly one per release. */
  @IsOptional() @IsBooleanString() launch?: string;
}

/**
 * What the stores are serving, and what is still allowed to run.
 *
 * Drives the update prompt and the blocking update screen. Everything here is
 * about the native binary, not about an OTA bundle — an update cannot change
 * which build somebody has.
 */
export class VersionGateDto {
  /** iOS or Android. Each store moves at its own pace. */
  @IsEnum(OtaPlatform) platform!: OtaPlatform;
  /** Which channel this gate is for. */
  @Matches(CHANNEL) channel!: string;

  /// The newest native build that exists for this platform and channel.
  @IsInt() @Min(0) latestBuild!: number;
  /**
   * What that build calls itself — "1.0.1". For people; the build number is
   * what is actually compared, because "1.10.0" sorts below "1.9.0" as text
   * and is newer as a version. A newer build carrying an older version name is
   * refused outright: it would tell somebody on 1.0.1 to install 1.0.0.
   */
  @IsOptional() @IsString() @MaxLength(40) latestVersionName?: string;

  /// Whether the store is serving it yet. CI says false; a person says true.
  @IsOptional() @IsBoolean() latestIsLive?: boolean;

  /// Below this, the app stops. Raised by a person, never by a deploy.
  @IsOptional() @IsInt() @Min(0) minSupportedBuild?: number;

  /** Where the update screen sends people — the App Store or Play listing. */
  @IsString() @MaxLength(300) storeUrl!: string;
  /**
   * What the update screen says, when the default wording is not enough —
   * a reason somebody must update rather than merely being asked to.
   */
  @IsOptional() @IsString() @MaxLength(300) message?: string;
}

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

/** Channels are a small closed set; a typo here serves nobody an update. */
const CHANNEL = /^[a-z][a-z0-9-]{1,30}$/;

export class CreateReleaseDto {
  @Matches(CHANNEL, { message: 'A channel is lowercase letters, digits and dashes' })
  channel!: string;

  /** Must match the native build's runtime version exactly. */
  @IsString() @MaxLength(40) runtimeVersion!: string;

  @IsEnum(OtaPlatform) platform!: OtaPlatform;

  @IsOptional() @IsEnum(OtaReleaseKind) kind?: OtaReleaseKind;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
  @IsOptional() @IsObject() extra?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(2000) changelog?: string;
}

export class UpdateReleaseDto {
  @IsOptional() @IsEnum(OtaReleaseStatus) status?: OtaReleaseStatus;

  /**
   * How many installs see it, 0–100.
   *
   * Sticky per install, so raising it only ever adds people — which is what
   * makes a staged rollout safe to walk up rather than a coin flip per launch.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) rolloutPercent?: number;

  @IsOptional() @IsString() @MaxLength(2000) changelog?: string;
}

export class UploadAssetDto {
  /** The JS bundle. Exactly one per release. */
  @IsOptional() @IsBooleanString() launch?: string;
}

export class VersionGateDto {
  @IsEnum(OtaPlatform) platform!: OtaPlatform;
  @Matches(CHANNEL) channel!: string;

  /// The newest native build that exists for this platform and channel.
  @IsInt() @Min(0) latestBuild!: number;
  @IsOptional() @IsString() @MaxLength(40) latestVersionName?: string;

  /// Whether the store is serving it yet. CI says false; a person says true.
  @IsOptional() @IsBoolean() latestIsLive?: boolean;

  /// Below this, the app stops. Raised by a person, never by a deploy.
  @IsOptional() @IsInt() @Min(0) minSupportedBuild?: number;

  @IsString() @MaxLength(300) storeUrl!: string;
  @IsOptional() @IsString() @MaxLength(300) message?: string;
}

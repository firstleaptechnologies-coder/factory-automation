import { OtaPlatform, OtaReleaseKind, OtaReleaseStatus } from '@prisma/client';
import {
  IsBooleanString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MaxLength,
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
  @IsString() @MaxLength(40) minimumVersion!: string;
  @IsOptional() @IsString() @MaxLength(40) recommendedVersion?: string;
  @IsOptional() @IsString() @MaxLength(300) message?: string;
}

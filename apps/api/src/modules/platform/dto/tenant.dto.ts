import { PLAN_KEYS } from '@fas/shared';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ALL_MODULES } from '@fas/shared';
import { TenantIsolation, TenantStatus } from '@prisma/client';

export class CreateTenantDto {
  /** What the shop types at sign-in. Lowercase, no spaces. */
  @IsString()
  @MinLength(2)
  @Matches(/^[a-z0-9][a-z0-9-]*$/, {
    message: 'Workspace must be lowercase letters, numbers and hyphens',
  })
  slug: string;

  @IsString() @MinLength(2) name: string;

  @IsOptional() @IsEnum(TenantIsolation) isolation?: TenantIsolation;
  /**
   * Required for DEDICATED. Stored encrypted — it is the key to an entire
   * client's database.
   */
  @IsOptional() @IsString() databaseUrl?: string;

  /** Refused unless it is a real plan. An unknown key resolves to the
   * default for entitlements and to no tier at all for money. */
  @IsOptional() @IsIn(PLAN_KEYS, { message: `plan must be one of ${PLAN_KEYS.join(', ')}` })
  plan?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() notes?: string;

  /** The first person who can sign in to the new workspace. */
  @IsString() @MinLength(2) ownerName: string;
  @IsString() @MinLength(1) ownerCode: string;
  @IsString() @MinLength(6) ownerPassword: string;
  @IsOptional() @IsEmail() ownerEmail?: string;
}

export class UpdateTenantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(TenantStatus) status?: TenantStatus;
  /** Refused unless it is a real plan. An unknown key resolves to the
   * default for entitlements and to no tier at all for money. */
  @IsOptional() @IsIn(PLAN_KEYS, { message: `plan must be one of ${PLAN_KEYS.join(', ')}` })
  plan?: string;
  /**
   * Modules granted on top of the plan.
   *
   * A shop that wants one thing from the next tier up should not have to buy
   * the tier. Only real module keys are kept — a typo here would otherwise sit
   * on the row for ever, granting nothing and explaining nothing.
   */
  @IsOptional()
  @IsArray()
  @IsIn(ALL_MODULES, { each: true })
  modules?: string[];
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ChangeIsolationDto {
  @IsEnum(TenantIsolation) isolation: TenantIsolation;
  /** Required when moving to DEDICATED. */
  @IsOptional() @IsString() databaseUrl?: string;
}

/**
 * Opening a workspace to help.
 *
 * The reason is not a formality: it is written into that shop's own history,
 * and it is the sentence they read months later when they ask who was in their
 * business and why.
 */
export class ImpersonateDto {
  @IsString() @MinLength(8) reason!: string;
}

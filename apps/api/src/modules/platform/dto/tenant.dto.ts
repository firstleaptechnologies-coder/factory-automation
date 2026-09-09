import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
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

  /**
   * Which tier they are on.
   *
   * Checked against the tier *rows* in the service, not against a list
   * compiled into this file: the owner writes tiers now, and a validator that
   * only knows the three we shipped with would refuse every tier they made —
   * which is a price list that cannot be sold from.
   */
  @IsOptional() @IsString() plan?: string;
  /** When their trial runs out. Null clears it. */
  @IsOptional() @IsDateString() trialEndsAt?: string | null;

  /** The day of the month they are billed on. */
  @IsOptional() @IsInt() @Min(1) @Max(28) billingDay?: number | null;

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
  /**
   * Which tier they are on.
   *
   * Checked against the tier *rows* in the service, not against a list
   * compiled into this file: the owner writes tiers now, and a validator that
   * only knows the three we shipped with would refuse every tier they made —
   * which is a price list that cannot be sold from.
   */
  @IsOptional() @IsString() plan?: string;
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
  /** When their trial runs out. Null clears it. */
  @IsOptional() @IsDateString() trialEndsAt?: string | null;

  /** The day of the month they are billed on. */
  @IsOptional() @IsInt() @Min(1) @Max(28) billingDay?: number | null;

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

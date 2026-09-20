import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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

  /** The shop's own name, as it appears to us and on their bill. */
  @IsString() @MinLength(2) name: string;

  /**
   * Whether their data shares the platform database with other shops, kept
   * apart by a tenant id, or lives in a database of its own. SHARED is the
   * default and the normal case; DEDICATED is for a client who requires it,
   * and it means every schema change has to reach them separately.
   */
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
  /**
   * Ours, not a client's. Kept out of every revenue figure.
   *
   * Settable rather than derived from the slug: which workspaces are ours is a
   * fact about the business, and a rule that guesses it from a name is one
   * that guesses wrong the first time we host a client called FLT.
   */
  @IsOptional() @IsBoolean() isInternal?: boolean;

  /** When their trial runs out. Null clears it. */
  @IsOptional() @IsDateString() trialEndsAt?: string | null;

  /** The day of the month they are billed on. */
  @IsOptional() @IsInt() @Min(1) @Max(28) billingDay?: number | null;

  /** Who we deal with at the shop. */
  @IsOptional() @IsString() contactName?: string;
  /** Where their invoice and anything else from us is sent. */
  @IsOptional() @IsEmail() contactEmail?: string;
  /** The number we ring them on. */
  @IsOptional() @IsString() contactPhone?: string;
  /** Anything about the account worth the next person knowing. */
  @IsOptional() @IsString() notes?: string;

  /** The first person who can sign in to the new workspace. */
  @IsString() @MinLength(2) ownerName: string;
  /**
   * The code they sign in with. Unique inside their workspace only, so every
   * shop can have an ADMIN and they are different people.
   */
  @IsString() @MinLength(1) ownerCode: string;
  /**
   * Their first password. Given to them once and meant to be changed — it
   * passes through whoever sets the shop up, which is exactly the reason not
   * to leave it in place.
   */
  @IsString() @MinLength(6) ownerPassword: string;
  /** Their email, where they have one. */
  @IsOptional() @IsEmail() ownerEmail?: string;
}

export class UpdateTenantDto {
  /** The shop's own name. */
  @IsOptional() @IsString() name?: string;
  /**
   * Whether the workspace is live, suspended or closed. Suspending stops
   * people signing in and keeps every row they have — a shop behind on payment
   * has not stopped being a shop, and their records are theirs.
   */
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
  /**
   * Ours, not a client's. Kept out of every revenue figure.
   *
   * Settable rather than derived from the slug: which workspaces are ours is a
   * fact about the business, and a rule that guesses it from a name is one
   * that guesses wrong the first time we host a client called FLT.
   */
  @IsOptional() @IsBoolean() isInternal?: boolean;

  /** When their trial runs out. Null clears it. */
  @IsOptional() @IsDateString() trialEndsAt?: string | null;

  /** The day of the month they are billed on. */
  @IsOptional() @IsInt() @Min(1) @Max(28) billingDay?: number | null;

  /** Who we deal with at the shop. */
  @IsOptional() @IsString() contactName?: string;
  /** Where their invoice is sent. */
  @IsOptional() @IsEmail() contactEmail?: string;
  /** The number we ring them on. */
  @IsOptional() @IsString() contactPhone?: string;
  /** Anything about the account worth the next person knowing. */
  @IsOptional() @IsString() notes?: string;
}

export class ChangeIsolationDto {
  /**
   * Moving a shop between the shared database and one of their own. Not a
   * setting so much as a migration: a dedicated tenant is one every schema
   * change has to reach separately, and a deploy that misses them is a green
   * deploy that left a client behind.
   */
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
  /**
   * Why we are going into their workspace. Written into that shop's own
   * history, so acting inside somebody's business is never anonymous — it is
   * the sentence they read months later when they ask who was in there.
   */
  @IsString() @MinLength(8) reason!: string;
}

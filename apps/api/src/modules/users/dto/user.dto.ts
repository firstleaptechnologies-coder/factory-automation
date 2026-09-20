import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

/**
 * Somebody who can sign in to this workspace.
 *
 * Not the same thing as an employee: most of the floor never has an account,
 * and an office account may belong to somebody who is not on the payroll.
 */
export class CreateUserDto {
  /**
   * The short code they sign in with — ADMIN, RK01. Unique within this
   * workspace only: two shops may both have an ADMIN and they are different
   * people, which is why the workspace is named before the code.
   */
  @IsString() code: string;
  /** Their name, as it appears against what they do. */
  @IsString() name: string;
  /** Their email, where they have one. */
  @IsOptional() @IsEmail() email?: string;
  /** Their number. */
  @IsOptional() @IsString() phone?: string;
  /** The password they will sign in with. Stored hashed and never readable back. */
  @IsString() @MinLength(6) password: string;
  /**
   * What they may do. A role is a set of permissions the shop defines, so a
   * shop that splits or renames jobs is not fighting the software.
   */
  @IsEnum(UserRole) role: UserRole;
}

export class UpdateUserDto {
  /** Their name. */
  @IsOptional() @IsString() name?: string;
  /** Their email. */
  @IsOptional() @IsEmail() email?: string;
  /** Their number. */
  @IsOptional() @IsString() phone?: string;
  /** What they may do. */
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  /**
   * Whether they can still sign in. Switching it off stops the account without
   * removing anything they did — every order they punched and every payment
   * they took stays attributed to them.
   */
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ChangePasswordDto {
  /** The new password. Replaces the old one; nothing can read the old one back. */
  @IsString() @MinLength(6) password: string;
}

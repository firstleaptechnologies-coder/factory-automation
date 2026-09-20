import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

/** What one of our own jobs is allowed to do. */
export class SaveRoleDto {
  /** What the role is called — "Support", "Owner". */
  @IsOptional() @IsString() @Length(2, 60) name?: string;
  /** What the role is for, so whoever assigns it knows which to pick. */
  @IsOptional() @IsString() blurb?: string;

  /**
   * Replaces what the role holds. The service drops anything that is not a
   * platform permission: a tenant permission here would grant nothing, because
   * a platform user is not inside anybody's workspace, but it would read as if
   * it did.
   */
  @IsArray() @IsString({ each: true }) permissions!: string[];
}

export class CreateRoleDto {
  /** A short key for it. Fixed once created, because staff refer to it. */
  @IsString() @Length(2, 40) key!: string;
  /** What the role is called. */
  @IsString() @Length(2, 60) name!: string;
  /** What the role is for. */
  @IsOptional() @IsString() blurb?: string;
  /**
   * What it may do. Platform permissions only — somebody answering a support
   * call has no business publishing a release, and a tenant permission here
   * would grant nothing while reading as though it did.
   */
  @IsArray() @IsString({ each: true }) permissions!: string[];
}

/** One of our own people, who works above every workspace. */
export class CreateStaffDto {
  /** The email they sign in with. Not an employee code — that belongs to a shop. */
  @IsEmail() email!: string;
  /** Their name, which is what a shop sees in their own history if we go in. */
  @IsString() @Length(2, 80) name!: string;
  /** Which of our roles they hold, and therefore what they may do. */
  @IsString() role!: string;
  /** Their first password. Longer than a shop's, because this is every shop. */
  @MinLength(8) password!: string;
}

export class SaveStaffDto {
  /** Their name. */
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  /** Which of our roles they hold. */
  @IsOptional() @IsString() role?: string;
  /**
   * Whether they can still sign in. Switching it off is what happens when
   * somebody leaves: their account stops working and everything they did —
   * every workspace opened, every release published — stays attributed to them.
   */
  @IsOptional() @IsBoolean() isActive?: boolean;
}

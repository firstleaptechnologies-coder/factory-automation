import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  /**
   * Which workspace to sign in to.
   *
   * Every tenant keeps its own separate set of people — no identity is shared
   * between two businesses — so employee codes like ADMIN are reusable, and the
   * workspace has to be named before a code can mean anything.
   */
  @IsString() @MinLength(1) workspace: string;

  /** Employee code, phone or email — unique within the workspace. */
  @IsString() @MinLength(1) identifier: string;

  /** Their password. Never stored as typed, and never returned by anything. */
  @IsString() @MinLength(1) password: string;
}

/** Platform sign-in. Platform users belong to no workspace. */
export class PlatformLoginDto {
  /** The FirstLeap staff member's email. Not an employee code — that is a shop's. */
  @IsString() email: string;
  /** Their password. */
  @IsString() @MinLength(1) password: string;
}

/** Checking a workspace exists before asking anybody for a password. */
export class LookupWorkspaceDto {
  /** The short name the shop was given — what goes in the first box. */
  @IsString() @MinLength(1) workspace: string;
}

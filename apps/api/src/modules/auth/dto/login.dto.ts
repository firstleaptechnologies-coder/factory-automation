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

  @IsString() @MinLength(1) password: string;
}

/** Platform sign-in. Platform users belong to no workspace. */
export class PlatformLoginDto {
  @IsString() email: string;
  @IsString() @MinLength(1) password: string;
}

export class LookupWorkspaceDto {
  @IsString() @MinLength(1) workspace: string;
}

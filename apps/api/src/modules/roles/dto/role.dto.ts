import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TENANT_PERMISSIONS } from '@fas/shared';

/**
 * A named set of permissions — what a job is allowed to do.
 *
 * The shop's own, because roles on a shop floor are not the same four
 * everywhere: a supervisor who may move orders back but not touch money is a
 * perfectly ordinary job and needs no code change to exist.
 */
export class RoleDto {
  /** What the role is called — "Supervisor", "Accounts", "Floor". */
  @IsString() @MinLength(2) @MaxLength(60) name!: string;
  /** What it is for, so whoever assigns it knows which one to pick. */
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  /**
   * Checked against the registry rather than taken as given.
   *
   * A permission string nobody recognises would sit in the database looking
   * like access somebody has, and grant nothing — which is worse than being
   * refused, because it is invisible. Platform permissions are not on the list
   * either: a shop cannot grant itself the run of the control plane.
   */
  @IsArray() @IsIn(TENANT_PERMISSIONS, { each: true }) permissions!: string[];
}

export class AssignRoleDto {
  /** Null takes the role away, leaving the person with none. */
  @IsOptional() @IsString() roleId?: string | null;
}

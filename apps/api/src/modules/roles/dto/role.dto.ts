import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TENANT_PERMISSIONS } from '@decor/shared';

export class RoleDto {
  @IsString() @MinLength(2) @MaxLength(60) name!: string;
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

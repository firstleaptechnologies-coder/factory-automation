import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class SaveRoleDto {
  @IsOptional() @IsString() @Length(2, 60) name?: string;
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
  @IsString() @Length(2, 40) key!: string;
  @IsString() @Length(2, 60) name!: string;
  @IsOptional() @IsString() blurb?: string;
  @IsArray() @IsString({ each: true }) permissions!: string[];
}

export class CreateStaffDto {
  @IsEmail() email!: string;
  @IsString() @Length(2, 80) name!: string;
  @IsString() role!: string;
  @MinLength(8) password!: string;
}

export class SaveStaffDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

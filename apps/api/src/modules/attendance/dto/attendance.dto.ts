import { AttendanceMark } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** One person's day, as the register records it. */
export class MarkDto {
  @IsString() employeeId!: string;
  @IsEnum(AttendanceMark) mark!: AttendanceMark;
  /** Times, where the shop keeps them. */
  @IsOptional() @IsDateString() inAt?: string;
  @IsOptional() @IsDateString() outAt?: string;
  /** Minutes past the ordinary day. A whole shift is about as far as it goes. */
  @IsOptional() @IsInt() @Min(0) @Max(16 * 60) @Type(() => Number) overtimeMinutes?: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

/**
 * The register for one day.
 *
 * A day at a time rather than a row at a time, because that is how a shop
 * marks it: somebody stands at the door in the morning and goes down the list.
 */
export class MarkDayDto {
  @IsDateString() date!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => MarkDto) marks!: MarkDto[];
}

export class RegisterQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @IsString() employeeId?: string;
}

export class DayQueryDto {
  @IsDateString() date!: string;
}

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
  /** Whose day this is. */
  @IsString() employeeId!: string;
  /**
   * Present, half a day, absent, on leave, a holiday, or the weekly off. Leave
   * is away with the shop's blessing — whether it is paid is the pay
   * structure's business, not this row's.
   */
  @IsEnum(AttendanceMark) mark!: AttendanceMark;
  /** Times, where the shop keeps them. */
  @IsOptional() @IsDateString() inAt?: string;
  /** When they left, where the shop keeps times. */
  @IsOptional() @IsDateString() outAt?: string;
  /** Minutes past the ordinary day. A whole shift is about as far as it goes. */
  @IsOptional() @IsInt() @Min(0) @Max(16 * 60) @Type(() => Number) overtimeMinutes?: number;
  /** Why the day was what it was — late, sent home, called in on an off day. */
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

/**
 * The register for one day.
 *
 * A day at a time rather than a row at a time, because that is how a shop
 * marks it: somebody stands at the door in the morning and goes down the list.
 */
export class MarkDayDto {
  /** Which day is being marked. */
  @IsDateString() date!: string;
  /** Everybody's mark for that day, in one go. */
  @IsArray() @ValidateNested({ each: true }) @Type(() => MarkDto) marks!: MarkDto[];
}

/** The register over a stretch of days — the view that settles arguments. */
export class RegisterQueryDto {
  /** From this day. */
  @IsDateString() from!: string;
  /** Up to this day. */
  @IsDateString() to!: string;
  /** Only one person's month. */
  @IsOptional() @IsString() employeeId?: string;
}

export class DayQueryDto {
  /** Which day's register to open. Today, almost always. */
  @IsDateString() date!: string;
}

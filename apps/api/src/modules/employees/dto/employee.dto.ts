import { EmploymentStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/** 12 digits, as printed. Spaces are stripped before this sees it. */
const AADHAAR = /^\d{12}$/;
/** ABCDE1234F — five letters, four digits, one letter. */
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
/** Four letters, a zero, then six alphanumerics. */
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * Empty means "clear what is stored", and skips the pattern check.
 *
 * Without this an identifier could be set and corrected but never removed:
 * `@IsOptional` lets through only null and undefined, and the form sends an
 * empty string when somebody empties the box. Somebody who typed the wrong
 * person's PAN has to be able to take it off.
 */
const given = (value: unknown) => value !== '';

/** As written on the card, minus the spacing it is printed with. */
function spaceless({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.replace(/[\s-]+/g, '') : value;
}

/** A PAN and an IFSC are upper case wherever they are printed. */
function upper({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value;
}

export class EmployeeDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(20) altPhone?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;

  @IsOptional() @IsString() @MaxLength(100) designation?: string;
  @IsOptional() @IsString() @MaxLength(100) department?: string;

  @IsDateString() joinedOn!: string;
  @IsOptional() @IsEnum(EmploymentStatus) status?: EmploymentStatus;
  /** Set when somebody leaves. Required by the service if status is LEFT. */
  @IsOptional() @IsDateString() leftOn?: string;

  /**
   * Government identifiers, sent whole and stored encrypted.
   *
   * Validated here rather than accepted as free text: a mistyped Aadhaar is
   * found the day it is entered or on the day somebody needs it, and the
   * second is always worse.
   *
   * Tidied before it is judged, because an Aadhaar is printed in groups of
   * four and a PAN is written in either case. Refusing what somebody copied
   * off the card would be pedantry rather than validation.
   */
  @IsOptional()
  @Transform(spaceless)
  @ValidateIf((_, value) => given(value))
  @Matches(AADHAAR, { message: 'An Aadhaar number is 12 digits' })
  aadhaar?: string;

  @IsOptional()
  @Transform(upper)
  @ValidateIf((_, value) => given(value))
  @Matches(PAN, { message: 'A PAN looks like ABCDE1234F' })
  pan?: string;

  @IsOptional() @IsString() @MaxLength(120) bankAccountName?: string;
  @IsOptional() @Transform(spaceless) @IsString() @MaxLength(30) bankAccountNumber?: string;
  @IsOptional()
  @Transform(upper)
  @ValidateIf((_, value) => given(value))
  @Matches(IFSC, { message: 'An IFSC looks like HDFC0001234' })
  bankIfsc?: string;

  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(120) emergencyName?: string;
  @IsOptional() @IsString() @MaxLength(20) emergencyPhone?: string;

  /** The login this person uses, when they have one. */
  @IsOptional() @IsString() userId?: string;
}

export class EmployeeQueryDto extends PaginationDto {
  @IsOptional() @IsEnum(EmploymentStatus) status?: EmploymentStatus;
  @IsOptional() @IsString() department?: string;
  /** Name, code, phone or designation. */
  @IsOptional() @IsString() declare search?: string;
}

export { AADHAAR, IFSC, PAN };

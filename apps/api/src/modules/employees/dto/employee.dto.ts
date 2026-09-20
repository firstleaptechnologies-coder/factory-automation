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

/**
 * Somebody the shop employs.
 *
 * Deliberately not the same thing as a login. Most of the floor will never
 * have an account, an account can be taken away without the person ceasing to
 * work here, and an office account may belong to somebody who is not on the
 * payroll at all.
 */
export class EmployeeDto {
  /** Their name, as it should appear on a payslip and a letter. */
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  /** The number they are reached on. */
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  /** A second number — a family member's, usually. */
  @IsOptional() @IsString() @MaxLength(20) altPhone?: string;
  /** Where a payslip or a letter is sent, when they have one. */
  @IsOptional() @IsString() @MaxLength(200) email?: string;

  /** What they do — carpenter, polisher, supervisor. Printed on their letters. */
  @IsOptional() @IsString() @MaxLength(100) designation?: string;
  /** Which part of the shop they work in. What attendance is grouped by. */
  @IsOptional() @IsString() @MaxLength(100) department?: string;

  /**
   * The day they started. What length of service is counted from, which is
   * what an experience letter states and what gratuity would turn on.
   */
  @IsDateString() joinedOn!: string;
  /**
   * Whether they are working, away, or have left. Somebody who leaves is
   * marked as having left and never deleted: their attendance, their payslips
   * and their letters are the shop's own records.
   */
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

  /**
   * Their PAN, stored encrypted like the Aadhaar above. Needed wherever tax is
   * deducted or reported against them, and wrong far more often than anybody
   * expects — which is why it is checked against its shape as it is typed
   * rather than on the day it is needed.
   */
  @IsOptional()
  @Transform(upper)
  @ValidateIf((_, value) => given(value))
  @Matches(PAN, { message: 'A PAN looks like ABCDE1234F' })
  pan?: string;

  /**
   * The name on the bank account, which is not always the name the shop uses
   * for them — a transfer to a name that does not match is a transfer that
   * bounces.
   */
  @IsOptional() @IsString() @MaxLength(120) bankAccountName?: string;
  /** Their account number, for paying salary by transfer. */
  @IsOptional() @Transform(spaceless) @IsString() @MaxLength(30) bankAccountNumber?: string;
  /**
   * The branch code their account sits at. Checked against its shape because a
   * transfer sent on a wrong IFSC either fails days later or reaches somebody
   * else, and neither is discovered before payday.
   */
  @IsOptional()
  @Transform(upper)
  @ValidateIf((_, value) => given(value))
  @Matches(IFSC, { message: 'An IFSC looks like HDFC0001234' })
  bankIfsc?: string;

  /** Where they live. Printed on an appointment letter. */
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  /** Who to call if something happens to them at work. */
  @IsOptional() @IsString() @MaxLength(120) emergencyName?: string;
  /**
   * The number to call. Worth keeping current for the whole floor: it is
   * needed on exactly the day nobody has time to go looking for it.
   */
  @IsOptional() @IsString() @MaxLength(20) emergencyPhone?: string;

  /** The login this person uses, when they have one. */
  @IsOptional() @IsString() userId?: string;
}

export class EmployeeQueryDto extends PaginationDto {
  /** Working, away, or gone. Defaults to everybody currently employed. */
  @IsOptional() @IsEnum(EmploymentStatus) status?: EmploymentStatus;
  /** Only one part of the shop. */
  @IsOptional() @IsString() department?: string;
  /** Name, code, phone or designation. */
  @IsOptional() @IsString() declare search?: string;
}

export { AADHAAR, IFSC, PAN };

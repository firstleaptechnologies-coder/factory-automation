import { PayKind, PaymentMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** A month, as the shop names it: 2026-09. */
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * How somebody is paid, from a given date.
 *
 * A raise is a new structure, never an edit. Last month's payslip has to stay
 * explicable after this month's rise, and a rate that changed underneath it
 * would make the two disagree with nobody able to say why.
 */
export class PayStructureDto {
  /** Whose pay this describes. */
  @IsString() employeeId!: string;
  /**
   * Monthly, daily, or by the piece. It decides what the rate means and how
   * the month is worked out — a monthly salary is divided by the shop's
   * working days, a daily rate is multiplied by days present.
   */
  @IsEnum(PayKind) kind!: PayKind;
  /**
   * The figure itself: a month's salary, a day's wage, or the price of one
   * piece, depending on the kind above.
   */
  @IsNumber() @Min(0.01) rate!: number;
  /** PIECE only: what one piece is, in the shop's own word. */
  @IsOptional() @IsString() @MaxLength(40) pieceLabel?: string;
  /**
   * What an hour past the ordinary day is worth. Kept apart from the rate
   * because overtime is usually agreed separately and not always at the same
   * proportion.
   */
  @IsOptional() @IsNumber() @Min(0) overtimeHourlyRate?: number;
  /**
   * The date this starts applying from. Months before it are still worked out
   * on whatever structure was in force then, which is what makes an old
   * payslip re-explainable.
   */
  @IsDateString() effectiveFrom!: string;
  /** Why it changed — a raise, a change of role, a correction. */
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

/**
 * Money handed over before payday, against the month's wages.
 *
 * Normal on a shop floor rather than exceptional. Recorded as it is given so
 * it comes off the month it belongs to, instead of being remembered at the end
 * of it.
 */
export class AdvanceDto {
  /** Who took it. */
  @IsString() employeeId!: string;
  /** How much, in rupees. */
  @IsNumber() @Min(1) amount!: number;
  /** The day it was handed over, which decides the month it comes off. */
  @IsDateString() givenOn!: string;
  /** How it was given — cash out of the drawer, or a transfer. */
  @IsEnum(PaymentMode) mode!: PaymentMode;
  /** What it was for, when that is worth keeping. */
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

/** Opening a month's salary run. */
export class OpenRunDto {
  /** Which month is being paid, as 2026-09. */
  @Matches(MONTH, { message: 'A month looks like 2026-09' }) month!: string;
  /**
   * How many days this shop counts as a full month.
   *
   * Asked rather than counted: some shops pay for 26 days and some for 30, and
   * a monthly salary is divided by whichever this one means.
   */
  @IsInt() @Min(1) @Max(31) @Type(() => Number) workingDays!: number;
  /** Anything about this month's run — a bonus paid, a shutdown. */
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

/**
 * Changing one person's payslip before the month is paid.
 *
 * Once a run is paid it is what the shop actually handed over, and a payslip
 * that changed afterwards would stop matching the money that left.
 */
export class AdjustPayslipDto {
  /** Piece work: how many, for this month. */
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) pieces?: number;
  /**
   * Anything coming off beyond the advances already recorded — a fine, damage,
   * money owed for something the shop bought for them.
   */
  @IsOptional() @IsNumber() @Min(0) otherDeductions?: number;
  /**
   * Why it is being deducted. Printed on the payslip, because a deduction the
   * person cannot account for is an argument on payday.
   */
  @IsOptional() @IsString() @MaxLength(300) deductionNote?: string;
  /** Anything else about this person's month. */
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

/** Paying a month's run, once every payslip is settled. */
export class PayRunDto {
  /**
   * How the wages were paid — cash out of the drawer, or transfers from the
   * bank. Required for the same reason it is on every other payment: the two
   * come out of different pots.
   */
  @IsEnum(PaymentMode) mode!: PaymentMode;
}

export class RunQueryDto {
  /** Only one person's payslip out of the month's run. */
  @IsOptional() @IsString() employeeId?: string;
}

export { MONTH };

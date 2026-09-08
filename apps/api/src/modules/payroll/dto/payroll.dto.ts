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

export class PayStructureDto {
  @IsString() employeeId!: string;
  @IsEnum(PayKind) kind!: PayKind;
  @IsNumber() @Min(0.01) rate!: number;
  /** PIECE only: what one piece is, in the shop's own word. */
  @IsOptional() @IsString() @MaxLength(40) pieceLabel?: string;
  @IsOptional() @IsNumber() @Min(0) overtimeHourlyRate?: number;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class AdvanceDto {
  @IsString() employeeId!: string;
  @IsNumber() @Min(1) amount!: number;
  @IsDateString() givenOn!: string;
  @IsEnum(PaymentMode) mode!: PaymentMode;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class OpenRunDto {
  @Matches(MONTH, { message: 'A month looks like 2026-09' }) month!: string;
  /**
   * How many days this shop counts as a full month.
   *
   * Asked rather than counted: some shops pay for 26 days and some for 30, and
   * a monthly salary is divided by whichever this one means.
   */
  @IsInt() @Min(1) @Max(31) @Type(() => Number) workingDays!: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class AdjustPayslipDto {
  /** Piece work: how many, for this month. */
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) pieces?: number;
  @IsOptional() @IsNumber() @Min(0) otherDeductions?: number;
  @IsOptional() @IsString() @MaxLength(300) deductionNote?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class PayRunDto {
  @IsEnum(PaymentMode) mode!: PaymentMode;
}

export class RunQueryDto {
  @IsOptional() @IsString() employeeId?: string;
}

export { MONTH };

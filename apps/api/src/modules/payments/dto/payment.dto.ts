import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaymentMode } from '@prisma/client';

/**
 * Recording money coming in.
 *
 * The mode is required, never defaulted: cash and online behave differently
 * afterwards — cash has to be walked to a bank — and guessing which one it was
 * makes the cash position meaningless.
 */
export class RecordPaymentDto {
  @Type(() => Number) @IsNumber() @Min(0.01) amount: number;
  @IsEnum(PaymentMode) mode: PaymentMode;

  /** UTR, cheque number or similar. */
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsDateString() receivedAt?: string;

  /**
   * Convenience for the common case: cash handed over and banked the same day.
   * Recorded as a deposit against this payment.
   */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) depositedAmount?: number;
  @IsOptional() @IsString() bankReference?: string;
}

export class RecordDepositDto {
  @Type(() => Number) @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsDateString() depositedAt?: string;
  @IsOptional() @IsString() bankReference?: string;
  @IsOptional() @IsString() note?: string;
  /** Omit to record a deposit that is not tied to one order's cash. */
  @IsOptional() @IsString() paymentId?: string;
}

export class CashPositionQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

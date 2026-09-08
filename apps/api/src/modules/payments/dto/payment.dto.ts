import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { PaymentMode } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

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

/**
 * Taking a receipt back.
 *
 * The reason is not optional. A row that says money was taken back without
 * saying why is the same problem as deleting it, one step removed.
 */
export class ReversePaymentDto {
  @IsString() @MinLength(3) reason!: string;
}

export class CashPositionQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

/**
 * Every movement of money except a payout, in one list.
 *
 * Payouts have a ledger of their own and are deliberately not here: they sit
 * beside orders rather than inside them, and mixing them into the takings
 * would be exactly the netting-off the books must not do.
 *
 * Spending is here, because it is not attached to any one order and a shop
 * asking what happened to its money means this list.
 */
export const TRANSACTION_KINDS = [
  'PAYMENT_CASH',
  'PAYMENT_ONLINE',
  'BANK_DEPOSIT',
  'EXPENSE',
] as const;

export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export class TransactionQueryDto extends PaginationDto {
  /** One kind, or all of them when omitted. */
  @IsOptional() @IsIn(TRANSACTION_KINDS) kind?: TransactionKind;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  /** Order code, client name, or a bank/UTR reference. */
  @IsOptional() @IsString() declare search?: string;
}

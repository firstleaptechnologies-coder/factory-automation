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
  /**
   * How much came in, in rupees. What is still owed on the order is its total
   * less everything received against it — so this figure is the one that
   * decides whether a job is settled, and it is never rounded to make it look
   * settled.
   */
  @Type(() => Number) @IsNumber() @Min(0.01) amount: number;
  /**
   * Cash, UPI, transfer or cheque. Required and never defaulted: cash has to
   * be walked to a bank afterwards and online money does not, so guessing
   * which one it was makes the cash position meaningless.
   */
  @IsEnum(PaymentMode) mode: PaymentMode;

  /** UTR, cheque number or similar. */
  @IsOptional() @IsString() reference?: string;
  /** Anything worth keeping about how it was paid — part payment, who handed it over. */
  @IsOptional() @IsString() note?: string;
  /**
   * When the money actually arrived, which is often not when somebody got
   * round to entering it. The date the books go by.
   */
  @IsOptional() @IsDateString() receivedAt?: string;

  /**
   * Convenience for the common case: cash handed over and banked the same day.
   * Recorded as a deposit against this payment.
   */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) depositedAmount?: number;
  /** The bank's own reference for that deposit, when there is one. */
  @IsOptional() @IsString() bankReference?: string;
}

/**
 * Cash taken out of the shop and put into the bank.
 *
 * Recorded separately from the payment that brought the cash in, because they
 * are two different events days apart. Until a deposit says otherwise the
 * money is still in the drawer, and that difference is the whole point of the
 * cash position.
 */
export class RecordDepositDto {
  /** How much was banked, in rupees. */
  @Type(() => Number) @IsNumber() @Min(0.01) amount: number;
  /** When it was banked. Today if nobody says otherwise. */
  @IsOptional() @IsDateString() depositedAt?: string;
  /** The slip number or the bank's reference, for matching against a statement. */
  @IsOptional() @IsString() bankReference?: string;
  /** Anything worth keeping — who took it, which branch. */
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
  /**
   * Why the receipt is being taken back — a cheque that bounced, money
   * recorded against the wrong order, an amount entered twice. Required and
   * kept forever: the original row stays exactly as it was and this is the
   * only record of why the figure moved.
   */
  @IsString() @MinLength(3) reason!: string;
}

/**
 * What came in as cash, what went to the bank, and what is therefore still in
 * the drawer.
 */
export class CashPositionQueryDto {
  /** Counting from this date. */
  @IsOptional() @IsDateString() from?: string;
  /** Counting up to this date. */
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
  'PURCHASE',
  'SALARY',
  'ADVANCE',
] as const;

export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export class TransactionQueryDto extends PaginationDto {
  /** One kind, or all of them when omitted. */
  @IsOptional() @IsIn(TRANSACTION_KINDS) kind?: TransactionKind;
  /** Movements on or after this date. */
  @IsOptional() @IsDateString() from?: string;
  /** Movements on or before this date. */
  @IsOptional() @IsDateString() to?: string;
  /** Order code, client name, or a bank/UTR reference. */
  @IsOptional() @IsString() declare search?: string;
}

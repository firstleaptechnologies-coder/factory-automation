import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DisbursementStatus, PaymentMode } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * Money the shop pays out on somebody else's behalf, against one order.
 *
 * A fabricator, an installer, a transporter, a site charge. It is recorded
 * against the order it belongs to and it stays beside that order — it is never
 * taken off the order's total. A shop that quietly reduces what a job was
 * worth by what it paid out cannot afterwards tell what it earned from what it
 * spent, and the one number it most needs is the difference.
 *
 * What the shop calls these is its own — "ISC", "site charges", anything —
 * which is what the label is for.
 */
export class CreateDisbursementDto {
  /**
   * Who is being paid. A person or a firm, as the shop would say it — this is
   * what somebody searches the payout ledger for later.
   */
  @IsString() @MinLength(1) payeeName: string;
  /**
   * How much, in rupees. Must be more than zero: a payout of nothing is not a
   * record of anything, and allowing it would let a row exist that changes no
   * figure and explains no decision.
   */
  @Type(() => Number) @IsNumber() @Min(0.01) amount: number;

  /**
   * Which heading it falls under — the shop's own list, so it can total what
   * it spends on transport separately from what it spends on installation.
   */
  @IsOptional() @IsString() categoryId?: string;
  /** A number for the payee, so whoever chases the payment can ring them. */
  @IsOptional() @IsString() payeeContact?: string;
  /** What it was for, in the shop's own words. */
  @IsOptional() @IsString() note?: string;

  /** Recording one already settled, rather than one still owed. */
  @IsOptional() @IsEnum(DisbursementStatus) status?: DisbursementStatus;
  /**
   * How it was paid — cash, UPI, transfer, cheque. Only meaningful when it is
   * being recorded as already settled.
   */
  @IsOptional() @IsEnum(PaymentMode) paidMode?: PaymentMode;
  /** When it was actually paid, which is not always when it was entered. */
  @IsOptional() @IsDateString() paidAt?: string;
  /**
   * The UTR, cheque number or transaction id. What the payment is found by if
   * the payee ever says it never arrived.
   */
  @IsOptional() @IsString() reference?: string;
}

/** Paying a payout that was recorded as owed. */
export class SettleDisbursementDto {
  /**
   * How it was paid. Required, never assumed: cash leaving the drawer and a
   * transfer leaving the bank are different events, and guessing which makes
   * the cash position wrong.
   */
  @IsEnum(PaymentMode) paidMode: PaymentMode;
  /** When it was paid. Today if nobody says otherwise. */
  @IsOptional() @IsDateString() paidAt?: string;
  /** The UTR, cheque number or transaction id. */
  @IsOptional() @IsString() reference?: string;
  /** Anything worth keeping about the settlement itself. */
  @IsOptional() @IsString() note?: string;
}

export class ReverseDisbursementDto {
  /** Required, and kept. A correction nobody explained is a figure that moved. */
  @IsString() @MinLength(4) @MaxLength(500) reason: string;
}

/**
 * Correcting a payout that has not been paid yet.
 *
 * Once it is settled it is money that left the shop, and money that has moved
 * is corrected by its opposite rather than edited — the same rule the receipts
 * follow.
 */
export class UpdateDisbursementDto {
  /** Who is being paid, if that was recorded wrongly. */
  @IsOptional() @IsString() payeeName?: string;
  /** A number for the payee. */
  @IsOptional() @IsString() payeeContact?: string;
  /** How much, in rupees. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) amount?: number;
  /** Which heading it falls under. */
  @IsOptional() @IsString() categoryId?: string;
  /** What it was for. */
  @IsOptional() @IsString() note?: string;
  /** Whether it is still owed or has been paid. */
  @IsOptional() @IsEnum(DisbursementStatus) status?: DisbursementStatus;
}

export class DisbursementQueryDto extends PaginationDto {
  /**
   * Owed, paid, or reversed. "What do we still owe on jobs" is the question
   * this ledger is opened for most often.
   */
  @IsOptional() @IsEnum(DisbursementStatus) status?: DisbursementStatus;
  /** Only one heading — everything spent on transport, say. */
  @IsOptional() @IsString() categoryId?: string;
  /** Recorded on or after this date. */
  @IsOptional() @IsDateString() from?: string;
  /** Recorded on or before this date. */
  @IsOptional() @IsDateString() to?: string;
}

/** A heading payouts are filed under. The shop's own list, not ours. */
export class CategoryDto {
  /**
   * A short code the shop uses for it. Fixed once created, because every
   * payout already filed under it refers to it — the name can be corrected,
   * this cannot.
   */
  @IsString() @MinLength(1) code: string;
  /** What it is called on screen and on the ledger. */
  @IsString() @MinLength(1) name: string;
  /**
   * Where it sits in the list. The headings used most often belong at the top,
   * because this list is read while somebody is standing waiting to be paid.
   */
  @IsOptional() @Type(() => Number) @IsNumber() sortOrder?: number;
}

/**
 * Renaming a heading, or switching one back on.
 *
 * There was only a way to switch one off. A heading taken out of use could
 * never come back, and a typo in one was permanent — which matters here
 * because these are what every payout in the ledger is filed under.
 */
export class UpdateCategoryDto {
  /** What it is called. Correcting this does not disturb what is filed under it. */
  @IsOptional() @IsString() @MinLength(1) name?: string;
  /**
   * Whether it is still offered when recording a payout. Switching it off
   * hides it from the list without touching a single payout already filed
   * under it — the ledger is a record of what happened and does not change
   * because a heading fell out of use.
   */
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** Where it sits in the list. */
  @IsOptional() @Type(() => Number) @IsNumber() sortOrder?: number;
}

export class LabelDto {
  /** What this tenant calls these charges — "ISC", "Site charges", anything. */
  @IsString() @MinLength(1) label: string;
}

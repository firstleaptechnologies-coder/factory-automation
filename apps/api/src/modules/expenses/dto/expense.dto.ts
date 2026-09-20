import { ExpenseOptionField, LedgerAccount } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/** ₹10 crore. A typo guard, not a business rule. */
const MAX_AMOUNT = 100_000_000;

export const EXPENSE_OPTION_FIELDS = [
  'PAYMENT_TYPE',
  'DONE_BY',
  'VENDOR',
  'SPENT_TYPE',
  'TO_NAME',
] as const;

/**
 * What the shop spends on itself, as opposed to what it spends on a job.
 *
 * Rent, electricity, tea, a replacement blade. The five dropdowns below are
 * the shop's own lists rather than ours, because one shop's "consumables" is
 * another's four separate headings — and a shop that cannot describe its
 * spending in its own words stops recording it.
 */
export class ExpenseDto {
  /** The day the money was spent, not the day it was typed in. */
  @IsDateString() date!: string;
  /**
   * What it was, in a line. What somebody scanning a month of spending reads,
   * so "diesel for the generator" rather than "misc".
   */
  @IsString() @MaxLength(500) description!: string;
  /**
   * How much, in rupees. Must be more than zero, and is capped at ten crore —
   * that ceiling is a guard against a typo, not a rule about what a shop may
   * spend.
   */
  @IsNumber() @IsPositive() @Min(0.01) amount!: number;

  /**
   * How it was paid, from the shop's own list. Each option is tied to an
   * account, so recording the payment also says which pot it came out of —
   * cash from the drawer and a transfer from the bank are not the same money.
   */
  @IsString() @MaxLength(100) paymentType!: string;
  /** Who spent it. What "who authorised this" is answered from later. */
  @IsString() @MaxLength(100) doneBy!: string;
  /** Who was actually handed the money, when that is a person rather than a firm. */
  @IsString() @MaxLength(200) toName!: string;
  /** Which supplier or shop it went to, from the list the shop keeps. */
  @IsString() @MaxLength(100) vendor!: string;
  /**
   * The heading it falls under — the shop's own categories. This is what
   * "where did the money go" is grouped by, so it is worth keeping short and
   * keeping few.
   */
  @IsString() @MaxLength(100) spentType!: string;
  /** Anything about the spending itself that the description has no room for. */
  @IsOptional() @IsString() @MaxLength(1000) note?: string;

  /** Left alone when the shop does not have them. */
  @IsOptional() @IsString() @MaxLength(20) vendorGstin?: string;
  /**
   * The amount before tax, off the bill. Only worth filling in when there is a
   * proper GST bill behind the spending — most daily spending has none.
   */
  @IsOptional() @IsNumber() @Min(0) taxableValue?: number;
  /**
   * The GST on it, taken off the bill rather than worked out here. The
   * vendor's arithmetic is what was paid.
   */
  @IsOptional() @IsNumber() @Min(0) taxAmount?: number;
  /**
   * Whether the shop can claim this tax back as input credit. Not every
   * expense qualifies — staff welfare and a good many vehicle costs do not —
   * and claiming one that does not is the kind of thing found a year later
   * with interest attached. Recorded as a decision rather than assumed from
   * the presence of a bill.
   */
  @IsOptional() @IsBoolean() itcEligible?: boolean;

  /**
   * The photographed bill or receipt. What makes the entry defensible: a
   * figure with no paper behind it is somebody's memory of a figure.
   */
  @IsOptional() @IsString() billFileId?: string;
  /** For job costing. It never reduces what the order collected. */
  @IsOptional() @IsString() orderId?: string;

  /**
   * Why this is being corrected.
   *
   * Kept apart from `note`, which is about the spending itself. This is about
   * the edit — "the bill was for two sheets, not three" — and it is the reason
   * an expense keeps a history of its own rather than only an audit row.
   */
  @IsOptional() @IsString() @MaxLength(500) editNote?: string;
}

export class ReverseExpenseDto {
  /** Required, and kept. A correction nobody explained is a figure that moved. */
  @IsString() @MinLength(4) @MaxLength(500) reason!: string;
}

export class ExpenseQueryDto extends PaginationDto {
  /** Spent on or after this date. */
  @IsOptional() @IsDateString() from?: string;
  /** Spent on or before this date. */
  @IsOptional() @IsDateString() to?: string;
  /** Only one heading — everything that went on transport, say. */
  @IsOptional() @IsString() spentType?: string;
  /** Only what one person spent. */
  @IsOptional() @IsString() doneBy?: string;
  /** Only what was paid one way — everything that came out of the drawer. */
  @IsOptional() @IsString() paymentType?: string;
  /** Only what went to one supplier. */
  @IsOptional() @IsString() vendor?: string;
  /** Only what was spent against one order, for costing that job. */
  @IsOptional() @IsString() orderId?: string;
  /** Description, recipient or note. */
  @IsOptional() @IsString() declare search?: string;
}

/** Totals by heading and by month — "where the money went". */
export class ExpenseAnalyticsQueryDto {
  /** Counting from this date. */
  @IsOptional() @IsDateString() from?: string;
  /** Counting up to this date. */
  @IsOptional() @IsDateString() to?: string;
}

/** One option on one of the expense dropdowns. */
export class ExpenseOptionDto {
  /**
   * Which dropdown it belongs to — how it was paid, who spent it, which
   * supplier, what heading, or who was handed the money.
   */
  @IsEnum(ExpenseOptionField) field!: ExpenseOptionField;
  /** What it says on the dropdown, in the shop's own words. */
  @IsString() @MaxLength(100) label!: string;
  /** PAYMENT_TYPE only: which account this way of paying comes out of. */
  @IsOptional() @IsEnum(LedgerAccount) account?: LedgerAccount;
}

export class UpdateExpenseOptionDto {
  /** What it says on the dropdown. Correcting it leaves past entries alone. */
  @IsOptional() @IsString() @MaxLength(100) label?: string;
  /** PAYMENT_TYPE only: which account this way of paying comes out of. */
  @IsOptional() @IsEnum(LedgerAccount) account?: LedgerAccount;
  /**
   * Whether it is still offered. Switching it off takes it out of the dropdown
   * and touches nothing already recorded under it — what was spent is a record
   * of what happened and does not change because a heading fell out of use.
   */
  @IsOptional() @IsBoolean() isActive?: boolean;
  /**
   * Where it sits in the dropdown. The ones used daily belong at the top,
   * because this list is read while somebody is standing at a counter.
   */
  @IsOptional() @IsInt() @Type(() => Number) sortOrder?: number;
}

/** Dragging one dropdown's options into the order the shop wants them. */
export class ReorderExpenseOptionsDto {
  /** Which dropdown is being reordered. */
  @IsEnum(ExpenseOptionField) field!: ExpenseOptionField;
  /** Every option on that dropdown, in the order they should appear. */
  @IsString({ each: true }) orderedIds!: string[];
}

export class OptionFieldParamDto {
  /** Which of the five expense dropdowns is being asked about. */
  @IsIn(EXPENSE_OPTION_FIELDS) field!: ExpenseOptionField;
}

export { MAX_AMOUNT };

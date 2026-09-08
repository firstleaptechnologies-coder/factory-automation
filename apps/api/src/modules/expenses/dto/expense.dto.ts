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

export class ExpenseDto {
  /** The day the money was spent, not the day it was typed in. */
  @IsDateString() date!: string;
  @IsString() @MaxLength(500) description!: string;
  @IsNumber() @IsPositive() @Min(0.01) amount!: number;

  @IsString() @MaxLength(100) paymentType!: string;
  @IsString() @MaxLength(100) doneBy!: string;
  @IsString() @MaxLength(200) toName!: string;
  @IsString() @MaxLength(100) vendor!: string;
  @IsString() @MaxLength(100) spentType!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;

  /** Left alone when the shop does not have them. */
  @IsOptional() @IsString() @MaxLength(20) vendorGstin?: string;
  @IsOptional() @IsNumber() @Min(0) taxableValue?: number;
  @IsOptional() @IsNumber() @Min(0) taxAmount?: number;
  @IsOptional() @IsBoolean() itcEligible?: boolean;

  @IsOptional() @IsString() billFileId?: string;
  /** For job costing. It never reduces what the order collected. */
  @IsOptional() @IsString() orderId?: string;
}

export class ExpenseQueryDto extends PaginationDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() spentType?: string;
  @IsOptional() @IsString() doneBy?: string;
  @IsOptional() @IsString() paymentType?: string;
  @IsOptional() @IsString() vendor?: string;
  @IsOptional() @IsString() orderId?: string;
  /** Description, recipient or note. */
  @IsOptional() @IsString() declare search?: string;
}

export class ExpenseAnalyticsQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class ExpenseOptionDto {
  @IsEnum(ExpenseOptionField) field!: ExpenseOptionField;
  @IsString() @MaxLength(100) label!: string;
  /** PAYMENT_TYPE only: which account this way of paying comes out of. */
  @IsOptional() @IsEnum(LedgerAccount) account?: LedgerAccount;
}

export class UpdateExpenseOptionDto {
  @IsOptional() @IsString() @MaxLength(100) label?: string;
  @IsOptional() @IsEnum(LedgerAccount) account?: LedgerAccount;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Type(() => Number) sortOrder?: number;
}

export class ReorderExpenseOptionsDto {
  @IsEnum(ExpenseOptionField) field!: ExpenseOptionField;
  @IsString({ each: true }) orderedIds!: string[];
}

export class OptionFieldParamDto {
  @IsIn(EXPENSE_OPTION_FIELDS) field!: ExpenseOptionField;
}

export { MAX_AMOUNT };

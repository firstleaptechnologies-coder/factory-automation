import { CreditReason } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class RaiseInvoiceDto {
  @IsOptional() @IsDateString() issuedOn?: string;
  /** When it is due, from whatever was agreed. Nothing chases it yet. */
  @IsOptional() @IsDateString() dueOn?: string;
  @IsOptional() @IsString() @MaxLength(2000) terms?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CancelDto {
  /**
   * Required.
   *
   * The number stays used whatever happens — a gap in an invoice series is the
   * first thing an assessing officer asks about — so the only record of why it
   * is void is this sentence.
   */
  @IsString() @MinLength(4) @MaxLength(300) reason!: string;
}

export class ChallanDto {
  @IsOptional() @IsDateString() issuedOn?: string;
  /** Where it went, which is not always the client's billing address. */
  @IsOptional() @IsString() @MaxLength(500) shipTo?: string;
  @IsOptional() @IsString() @MaxLength(160) transport?: string;
  @IsOptional() @IsString() @MaxLength(40) vehicle?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CreditNoteDto {
  /** The taxable value being credited. The GST comes off in proportion. */
  @IsNumber() @Min(0.01) taxable!: number;
  @IsEnum(CreditReason) reason!: CreditReason;
  /** Required, and in the shop's own words. */
  @IsString() @MinLength(4) @MaxLength(500) note!: string;
  @IsOptional() @IsDateString() issuedOn?: string;
}

export class DocumentQueryDto {
  @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  /** Invoice number, client name or order number. */
  @IsOptional() @IsString() search?: string;
}

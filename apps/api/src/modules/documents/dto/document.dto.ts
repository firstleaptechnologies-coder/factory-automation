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

/**
 * The tax invoice for an order.
 *
 * Numbered in an unbroken series, because a gap in an invoice series is the
 * first thing an assessing officer asks about. What it shows — CGST and SGST
 * against a single IGST line — follows from the client's state against the
 * shop's.
 */
export class RaiseInvoiceDto {
  /** The date on the invoice. Today if nobody says otherwise. */
  @IsOptional() @IsDateString() issuedOn?: string;
  /** When it is due, from whatever was agreed. Nothing chases it yet. */
  @IsOptional() @IsDateString() dueOn?: string;
  /**
   * The terms printed at the foot of it. Defaults to whatever the shop has set
   * under Firm details, so the usual case needs nothing typed here.
   */
  @IsOptional() @IsString() @MaxLength(2000) terms?: string;
  /** Anything for this one invoice that the standing terms do not cover. */
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

/**
 * The delivery challan — what physically went out, and with whom.
 *
 * Separate from the invoice because goods and the bill for them do not always
 * travel together, and it is the challan that has to be in the vehicle.
 */
export class ChallanDto {
  /** The date on the challan. Today if nobody says otherwise. */
  @IsOptional() @IsDateString() issuedOn?: string;
  /** Where it went, which is not always the client's billing address. */
  @IsOptional() @IsString() @MaxLength(500) shipTo?: string;
  /** Who carried it — the transporter's name, or the shop's own driver. */
  @IsOptional() @IsString() @MaxLength(160) transport?: string;
  /**
   * The vehicle number. What is asked for if a delivery is stopped or a
   * consignment has to be traced.
   */
  @IsOptional() @IsString() @MaxLength(40) vehicle?: string;
  /** Anything about the delivery itself — how many packages, what was damaged. */
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CreditNoteDto {
  /** The taxable value being credited. The GST comes off in proportion. */
  @IsNumber() @Min(0.01) taxable!: number;
  @IsEnum(CreditReason) reason!: CreditReason;
  /** Required, and in the shop's own words. */
  @IsString() @MinLength(4) @MaxLength(500) note!: string;
  /** The date on the credit note. Today if nobody says otherwise. */
  @IsOptional() @IsDateString() issuedOn?: string;
}

export class DocumentQueryDto {
  /** Only the documents raised against one order. */
  @IsOptional() @IsString() orderId?: string;
  /** Issued on or after this date. */
  @IsOptional() @IsDateString() from?: string;
  /** Issued on or before this date. */
  @IsOptional() @IsDateString() to?: string;
  /** Invoice number, client name or order number. */
  @IsOptional() @IsString() search?: string;
}

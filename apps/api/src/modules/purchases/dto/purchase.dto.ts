import { PaymentMode, PurchaseStatus, StockMoveKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/** One line of a purchase order: what is being bought, and at what price. */
export class PurchaseItemDto {
  /** Which material, from the ones the shop has configured. */
  @IsString() materialId!: string;
  /**
   * Which thickness of it. The same board in two thicknesses is two different
   * things to buy, to stock and to cut from.
   */
  @IsOptional() @IsString() thicknessId?: string;
  /** A sheet, a kilo, a length — the shop's own word for one of them. */
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  /** How many, in that unit. Fractions allowed — half a kilo is a real order. */
  @IsNumber() @Min(0.001) quantity!: number;
  /**
   * The price per unit, before tax. What the shop agreed, not what it hoped
   * for: this is the figure the job's material cost is worked out from.
   */
  @IsNumber() @Min(0) rate!: number;
  /** Taken off the bill rather than derived: a vendor's arithmetic is what is owed. */
  @IsOptional() @IsNumber() @Min(0) gstRatePct?: number;
  /**
   * The tax on this line in rupees, taken off the vendor's bill rather than
   * calculated here. Their arithmetic is what is owed, and a figure worked out
   * differently would disagree with the paper by a rupee and cost an afternoon.
   */
  @IsOptional() @IsNumber() @Min(0) taxAmount?: number;
  /** Anything about this line — a batch, a shade, a substitution agreed. */
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

/** An order placed on a vendor. */
export class PurchaseDto {
  /** Who it is being bought from. */
  @IsString() vendorId!: string;
  /**
   * When it was promised. What a late delivery is measured against, and what
   * the floor plans around when a job is waiting on the material.
   */
  @IsOptional() @IsDateString() expectedOn?: string;
  /**
   * Freight, loading, and anything else on the bill that is not a line of
   * material. Kept separate so the rate per sheet stays the rate per sheet —
   * spreading delivery across the lines would quietly inflate what the shop
   * thinks its material costs.
   */
  @IsOptional() @IsNumber() @Min(0) otherCharges?: number;
  /** Anything about the order as a whole — where to deliver, who to ask for. */
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  /** What is being bought. */
  @IsArray() @ValidateNested({ each: true }) @Type(() => PurchaseItemDto)
  items!: PurchaseItemDto[];
}

/** The vendor's own paperwork, once it arrives. */
/** The vendor's own paperwork, once it arrives. */
export class BillDto {
  /**
   * The number on their bill. What the shop's payment is matched against, and
   * what its accountant looks for when claiming the input credit.
   */
  @IsString() @MaxLength(60) billNumber!: string;
  /**
   * The date on their bill, which decides the quarter the credit falls in —
   * not the date it was entered here.
   */
  @IsDateString() billedOn!: string;
  /** Freight and loading as billed, if it differs from what was expected. */
  @IsOptional() @IsNumber() @Min(0) otherCharges?: number;
}

/** Paying a vendor's bill. */
export class PayPurchaseDto {
  /**
   * How it was paid — cash, UPI, transfer, cheque. Required for the same
   * reason it is on a receipt: cash leaving the drawer and money leaving the
   * bank are different events.
   */
  @IsEnum(PaymentMode) mode!: PaymentMode;
  /** When it was paid. Today if nobody says otherwise. */
  @IsOptional() @IsDateString() paidOn?: string;
}

/** One line of a delivery: how many of an ordered line actually turned up. */
/** One line of a delivery: how many of an ordered line actually turned up. */
export class ReceiptLineDto {
  /** Which line of the purchase order this is against. */
  @IsString() purchaseItemId!: string;
  /**
   * How many actually arrived, which is not always how many were ordered. A
   * short delivery recorded as a full one is stock the shop thinks it has and
   * a job that stops when somebody goes looking for it.
   */
  @IsNumber() @Min(0.001) quantity!: number;
}

/**
 * Booking in a delivery.
 *
 * This is what puts stock on the rack — nothing else does, so every sheet in
 * the building has a purchase, and a bill, behind it.
 */
export class ReceiveDto {
  /** When it arrived. Today if nobody says otherwise. */
  @IsOptional() @IsDateString() at?: string;
  /** What turned up, line by line. */
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiptLineDto)
  lines!: ReceiptLineDto[];
  /** Anything about the delivery — what was damaged, who signed for it. */
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class PurchaseQueryDto extends PaginationDto {
  /**
   * Where it has got to — drafted, placed, received, billed, paid. "What have
   * we ordered that has not arrived" is what this list is opened for.
   */
  @IsOptional() @IsEnum(PurchaseStatus) status?: PurchaseStatus;
  /** Only what was bought from one vendor. */
  @IsOptional() @IsString() vendorId?: string;
  /** Purchase number, vendor, or the vendor's bill number. */
  @IsOptional() @IsString() declare search?: string;
}

/**
 * A movement of stock that is not a delivery.
 *
 * Issuing to an order, the offcut that comes back, the waste, a count that
 * disagreed. A receipt is not here: stock arrives against a purchase, so that
 * it always has a bill behind it.
 */
export class StockMoveDto {
  /** Which material moved. */
  @IsString() materialId!: string;
  /** Which thickness of it. */
  @IsOptional() @IsString() thicknessId?: string;
  /**
   * What kind of movement it was — issued to a job, returned as an offcut,
   * wasted, or an adjustment after a count. The kind decides which way the
   * quantity goes, which is why the quantity itself is always positive.
   */
  @IsEnum(StockMoveKind) kind!: StockMoveKind;
  /** Always positive here; which way it goes is decided by the kind. */
  @IsNumber() @Min(0.001) quantity!: number;
  /** A sheet, a kilo, a length — the shop's own word for one of them. */
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  /** Which order it was cut for, when it was cut for one. */
  @IsOptional() @IsString() orderId?: string;
  /** When it moved. Today if nobody says otherwise. */
  @IsOptional() @IsDateString() at?: string;
  /** Required for waste and for an adjustment. */
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
  /** Anything else worth keeping about the movement. */
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class StockQueryDto {
  /** Only one material's level. */
  @IsOptional() @IsString() materialId?: string;
  /** Matches a material's name or code. */
  @IsOptional() @IsString() search?: string;
  /** Only what has fallen to its reorder level. */
  @IsOptional() @IsString() lowOnly?: string;
}

/**
 * What was thrown away, over a period.
 *
 * Asked for over a range rather than in total, because waste is only useful
 * compared with itself: what this month cost against last month is the figure
 * that changes how a shop cuts.
 */
export class WasteQueryDto {
  /** Counting from this date. */
  @IsDateString() from!: string;
  /** Counting up to this date. */
  @IsDateString() to!: string;
  /** Only one material's waste. */
  @IsOptional() @IsString() materialId?: string;
}

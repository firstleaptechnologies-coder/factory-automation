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

export class PurchaseItemDto {
  @IsString() materialId!: string;
  @IsOptional() @IsString() thicknessId?: string;
  /** A sheet, a kilo, a length — the shop's own word for one of them. */
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsNumber() @Min(0) rate!: number;
  /** Taken off the bill rather than derived: a vendor's arithmetic is what is owed. */
  @IsOptional() @IsNumber() @Min(0) gstRatePct?: number;
  @IsOptional() @IsNumber() @Min(0) taxAmount?: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class PurchaseDto {
  @IsString() vendorId!: string;
  @IsOptional() @IsDateString() expectedOn?: string;
  @IsOptional() @IsNumber() @Min(0) otherCharges?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PurchaseItemDto)
  items!: PurchaseItemDto[];
}

/** The vendor's own paperwork, once it arrives. */
export class BillDto {
  @IsString() @MaxLength(60) billNumber!: string;
  @IsDateString() billedOn!: string;
  @IsOptional() @IsNumber() @Min(0) otherCharges?: number;
}

export class PayPurchaseDto {
  @IsEnum(PaymentMode) mode!: PaymentMode;
  @IsOptional() @IsDateString() paidOn?: string;
}

/** One line of a delivery: how many of an ordered line actually turned up. */
export class ReceiptLineDto {
  @IsString() purchaseItemId!: string;
  @IsNumber() @Min(0.001) quantity!: number;
}

export class ReceiveDto {
  @IsOptional() @IsDateString() at?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiptLineDto)
  lines!: ReceiptLineDto[];
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class PurchaseQueryDto extends PaginationDto {
  @IsOptional() @IsEnum(PurchaseStatus) status?: PurchaseStatus;
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
  @IsString() materialId!: string;
  @IsOptional() @IsString() thicknessId?: string;
  @IsEnum(StockMoveKind) kind!: StockMoveKind;
  /** Always positive here; which way it goes is decided by the kind. */
  @IsNumber() @Min(0.001) quantity!: number;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  /** Which order it was cut for, when it was cut for one. */
  @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsDateString() at?: string;
  /** Required for waste and for an adjustment. */
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class StockQueryDto {
  @IsOptional() @IsString() materialId?: string;
  @IsOptional() @IsString() search?: string;
  /** Only what has fallen to its reorder level. */
  @IsOptional() @IsString() lowOnly?: string;
}

export class WasteQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @IsString() materialId?: string;
}

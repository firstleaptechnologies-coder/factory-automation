import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { LocationType, StockUnitKind, StockUnitStatus } from '@prisma/client';

export class CreateLocationDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsEnum(LocationType) type?: LocationType;
}

export class ReceiveStockDto {
  @IsString() materialId: string;
  @IsOptional() @IsString() locationId?: string;

  /** Number of identical pieces being received; each gets its own barcode. */
  @Type(() => Number) @IsInt() @Min(1) pieces: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lengthMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) widthMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) thicknessMm?: number;
  /** For non-sheet materials (kg, rmt, pcs) — quantity per piece. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quantity?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitCost?: number;
  @IsOptional() @IsString() batchNo?: string;
  @IsOptional() @IsString() note?: string;
}

export class IssueToJobDto {
  @IsString() jobId: string;
  @IsArray() @IsString({ each: true }) stockUnitIds: string[];
  @IsOptional() @IsString() note?: string;
}

export class OffcutDto {
  @Type(() => Number) @IsNumber() @Min(1) lengthMm: number;
  @Type(() => Number) @IsNumber() @Min(1) widthMm: number;
  @IsOptional() @IsString() locationId?: string;
}

/**
 * Closing out a consumed sheet: what came off it as reusable offcuts, and what
 * was simply lost. Called from the shop floor after a nest finishes.
 */
export class CloseStockUnitDto {
  @IsString() stockUnitId: string;
  @IsOptional() @IsString() jobId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OffcutDto)
  offcuts?: OffcutDto[];

  @IsOptional() @IsString() remarks?: string;
}

export class TransferStockDto {
  @IsString() stockUnitId: string;
  @IsString() toLocationId: string;
  @IsOptional() @IsString() note?: string;
}

export class AdjustStockDto {
  @IsString() stockUnitId: string;
  @IsEnum(StockUnitStatus) status: StockUnitStatus;
  @IsOptional() @IsString() note?: string;
}

export class StockQueryDto {
  @IsOptional() @IsString() materialId?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsEnum(StockUnitKind) kind?: StockUnitKind;
  @IsOptional() @IsEnum(StockUnitStatus) status?: StockUnitStatus;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() offcutsOnly?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit = 50;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

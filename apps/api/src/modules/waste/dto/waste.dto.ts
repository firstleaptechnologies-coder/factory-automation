import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { WasteDisposition, WasteType } from '@prisma/client';

export class CreateWasteRecordDto {
  @IsString() materialId: string;
  @IsOptional() @IsString() jobId?: string;
  @IsOptional() @IsString() nestPlanId?: string;
  @IsEnum(WasteType) type: WasteType;
  @IsOptional() @IsEnum(WasteDisposition) disposition?: WasteDisposition;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) areaSqm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) weightKg?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quantity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lengthMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) widthMm?: number;

  @IsOptional() @IsBoolean() isReusable?: boolean;
  @IsOptional() @IsString() reasonId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) costImpact?: number;
  @IsOptional() @IsString() remarks?: string;
}

export class UpdateDispositionDto {
  @IsEnum(WasteDisposition) disposition: WasteDisposition;
  @IsOptional() @IsString() remarks?: string;
}

export class WasteQueryDto {
  @IsOptional() @IsString() materialId?: string;
  @IsOptional() @IsEnum(WasteType) type?: WasteType;
  @IsOptional() @IsEnum(WasteDisposition) disposition?: WasteDisposition;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) page = 1;
  @IsOptional() @Type(() => Number) limit = 50;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

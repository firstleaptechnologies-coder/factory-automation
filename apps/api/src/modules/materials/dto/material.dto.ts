import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Uom } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateMaterialCategoryDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
}

export class CreateMaterialDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsString() categoryId: string;
  @IsEnum(Uom) uom: Uom;

  @IsOptional() @IsBoolean() isSheetGood?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) thicknessMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lengthMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) widthMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) densityKgM3?: number;
  @IsOptional() @IsBoolean() hasGrain?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) wastageAllowancePct?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultKerfMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) standardCost?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) reorderLevel?: number;
  @IsOptional() @IsString() hsnCode?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) gstRatePct?: number;
}

export class UpdateMaterialDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsEnum(Uom) uom?: Uom;
  @IsOptional() @IsBoolean() isSheetGood?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) thicknessMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lengthMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) widthMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) densityKgM3?: number;
  @IsOptional() @IsBoolean() hasGrain?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) wastageAllowancePct?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultKerfMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) standardCost?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) reorderLevel?: number;
  @IsOptional() @IsString() hsnCode?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) gstRatePct?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/**
 * A real class, not `PaginationDto & { categoryId?: string }`: Nest's
 * ValidationPipe can only transform a parameter whose type is a class it can
 * see at runtime. An intersection type erases to Object, validation is skipped,
 * and `limit` reaches Prisma as a string.
 */
export class MaterialQueryDto extends PaginationDto {
  @IsOptional() @IsString() categoryId?: string;
}

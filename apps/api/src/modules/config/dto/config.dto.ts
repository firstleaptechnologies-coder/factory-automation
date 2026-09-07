import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LENGTH_UNITS, LengthUnit } from '@decor/shared';

/**
 * Admin screens let people type sizes in whatever unit they think in, so every
 * dimension arrives as a value plus its unit and is converted to millimetres
 * before it is stored. The DTO never carries a bare number.
 */
export class MeasurementDto {
  @Type(() => Number) @IsNumber() @Min(0) value: number;
  @IsIn(LENGTH_UNITS as unknown as string[]) unit: LengthUnit;
}

export class CreateMaterialDto {
  @IsString() @MinLength(1) code: string;
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;

  /** Thickness options offered for this material. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ThicknessDto)
  thicknesses?: ThicknessDto[];
}

export class ThicknessDto {
  @ValidateNested() @Type(() => MeasurementDto) value: MeasurementDto;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateMaterialDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateSizePresetDto {
  @IsString() @MinLength(1) code: string;
  @IsString() @MinLength(1) name: string;
  @ValidateNested() @Type(() => MeasurementDto) length: MeasurementDto;
  @ValidateNested() @Type(() => MeasurementDto) width: MeasurementDto;
  @IsOptional() @ValidateNested() @Type(() => MeasurementDto) thickness?: MeasurementDto;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateSizePresetDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @ValidateNested() @Type(() => MeasurementDto) length?: MeasurementDto;
  @IsOptional() @ValidateNested() @Type(() => MeasurementDto) width?: MeasurementDto;
  @IsOptional() @ValidateNested() @Type(() => MeasurementDto) thickness?: MeasurementDto;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}


/**
 * A GST rate the tenant can apply.
 *
 * Slabs are per tenant because rates differ by what a shop sells and change
 * with the law; hard-coding 5/12/18/28 would date the product.
 */
export class GstSlabDto {
  @IsString() @MinLength(1) name: string;
  @Type(() => Number) @IsNumber() @Min(0) ratePct: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateGstSlabDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) ratePct?: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

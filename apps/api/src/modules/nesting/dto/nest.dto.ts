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
import { NestPlanStatus } from '@prisma/client';

export class NestPartInputDto {
  @IsOptional() @IsString() orderItemId?: string;
  @IsString() label: string;
  @Type(() => Number) @IsNumber() @Min(1) lengthMm: number;
  @Type(() => Number) @IsNumber() @Min(1) widthMm: number;
  @Type(() => Number) @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsBoolean() allowRotation?: boolean;
}

export class CreateNestPlanDto {
  @IsString() materialId: string;

  /** Defaults to the material's standard sheet size when omitted. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) sheetLengthMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) sheetWidthMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) kerfMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) marginMm?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NestPartInputDto)
  parts: NestPartInputDto[];
}

/** Same input, but nothing is written — used by the planner to compare options. */
export class PreviewNestDto extends CreateNestPlanDto {}

export class UpdateNestStatusDto {
  @IsEnum(NestPlanStatus) status: NestPlanStatus;
}

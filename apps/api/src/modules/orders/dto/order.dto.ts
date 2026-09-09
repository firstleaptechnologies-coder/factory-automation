import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  AttachmentKind,
  PricingMode,
  Priority,
  RateUnit,
  TaxTreatment,
} from '@prisma/client';
import { LENGTH_UNITS, LengthUnit } from '@fas/shared';
import { MeasurementDto } from '../../config/dto/config.dto';
import { CreateClientDto } from '../../clients/dto/client.dto';

export class PunchItemDto {
  /** Pick a configured size, or give explicit dimensions, or both (explicit wins). */
  @IsOptional() @IsString() sizePresetId?: string;
  @IsOptional() @ValidateNested() @Type(() => MeasurementDto) length?: MeasurementDto;
  @IsOptional() @ValidateNested() @Type(() => MeasurementDto) width?: MeasurementDto;
  @IsOptional() @ValidateNested() @Type(() => MeasurementDto) thickness?: MeasurementDto;

  @IsString() materialId: string;
  /** A configured thickness option for that material. */
  @IsOptional() @IsString() materialThicknessId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsString() notes?: string;

  /**
   * Priced the way it was quoted. `rateUnit` decides what `rate` means — a
   * price per square foot, per piece, per running foot, or the line total
   * itself when it was quoted as one figure.
   */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) rate?: number;
  @IsOptional() @IsEnum(RateUnit) rateUnit?: RateUnit;
  /** GST slab for this line. Falls back to the tenant's default. */
  @IsOptional() @IsString() gstSlabId?: string;
}

/**
 * Punching an order. The client is either an existing id or a new one created
 * inline — the person taking the order should never have to leave the screen to
 * add a client first.
 */
export class PunchOrderDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @ValidateNested() @Type(() => CreateClientDto) newClient?: CreateClientDto;

  @IsString() @MinLength(1) location: string;

  @IsOptional() @IsString() workflowId?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() notes?: string;

  /** Which stage to start at. Defaults to the workflow's default entry point. */
  @IsOptional() @IsString() startStatusId?: string;

  /** ITEMISED adds up the lines; LUMP_SUM uses `total` as quoted. */
  @IsOptional() @IsEnum(PricingMode) pricingMode?: PricingMode;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discount?: number;
  /** Required for LUMP_SUM — the single figure that was quoted. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) total?: number;
  /** GST slab for a LUMP_SUM order, applied to the whole quoted figure. */
  @IsOptional() @IsString() gstSlabId?: string;
  /**
   * How the quoted figure relates to the GST on it. EXCLUSIVE adds the tax on
   * top; INCLUSIVE and ABSORBED take it out of what was quoted.
   */
  @IsOptional() @IsEnum(TaxTreatment) taxTreatment?: TaxTreatment;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PunchItemDto)
  items: PunchItemDto[];
}

export class UpdateOrderDto {
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsEnum(PricingMode) pricingMode?: PricingMode;
  @IsOptional() @IsEnum(TaxTreatment) taxTreatment?: TaxTreatment;
  @IsOptional() @IsString() gstSlabId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) total?: number;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() notes?: string;
}

/**
 * Re-stating the money terms of an order that already exists.
 *
 * Separate from UpdateOrderDto because it re-prices every line and can change
 * whether the order is settled — that is not something to slip into a general
 * edit of the notes field.
 */
export class RepriceOrderDto {
  @IsOptional() @IsEnum(PricingMode) pricingMode?: PricingMode;
  @IsOptional() @IsEnum(TaxTreatment) taxTreatment?: TaxTreatment;
  /** Only meaningful for a LUMP_SUM order. */
  @IsOptional() @IsString() gstSlabId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) total?: number;
}

export class ChangeStatusDto {
  @IsString() toStatusId: string;
  @IsOptional() @IsString() note?: string;
  /**
   * "Yes, I know this goes back."
   *
   * A move the flow does not draw is refused unless the caller says this — the
   * machine half of the question the screen asks, so an older client or a
   * stray script can never walk an order backwards without meaning to.
   */
  @IsOptional() @IsBoolean() reverse?: boolean;
}

export class AttachmentMetaDto {
  @IsEnum(AttachmentKind) kind: AttachmentKind;
  /** Required for reference images — a picture with no context is not useful. */
  @IsOptional() @IsString() description?: string;
}

export class OrderQueryDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() statusId?: string;
  @IsOptional() @IsString() materialId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;

  /** Unit the caller wants dimensions rendered in. Storage is always mm. */
  @IsOptional() @IsIn(LENGTH_UNITS as unknown as string[]) unit?: LengthUnit;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit = 25;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
